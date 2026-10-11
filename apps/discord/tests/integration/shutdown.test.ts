import { EventEmitter } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { ChannelType } from 'discord.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { completedQuestion } from '../fixtures/api.js';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

function scriptedClient() {
  const client = new EventEmitter() as EventEmitter & {
    user: { id: string; tag: string };
    login: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    guilds: { cache: { size: number } };
    ws: { shards: Map<number, unknown> };
  };
  client.user = { id: 'bot', tag: 'bot#0001' };
  client.login = vi.fn().mockResolvedValue(undefined);
  client.destroy = vi.fn();
  client.guilds = { cache: { size: 1 } };
  client.ws = { shards: new Map([[0, {}]]) };
  return client;
}

function mention(reply: ReturnType<typeof vi.fn>) {
  return {
    id: 'message-1',
    author: { id: '111', bot: false },
    webhookId: null,
    guildId: null,
    channelId: 'dm-1',
    content: '<@bot> What is a Shove action?',
    mentions: { users: { has: (id: string) => id === 'bot' } },
    channel: {
      type: ChannelType.DM,
      isThread: () => false,
      sendTyping: vi.fn().mockResolvedValue(undefined),
    },
    reference: null,
    fetchReference: vi.fn(),
    reply,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

let server: Server;
let handler: Handler = (_request, response) => {
  response.writeHead(404);
  response.end();
};
const seen: string[] = [];

beforeEach(async () => {
  vi.resetModules();
  seen.length = 0;
  server = createServer((request, response) => {
    seen.push(`${request.method} ${request.url}`);
    handler(request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  vi.stubEnv('API_URL', `http://127.0.0.1:${address.port}`);
  vi.stubEnv('DISCORD_TOKEN', 'test-token');
  vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
  vi.stubEnv('GUILD_ID', 'test-guild-id');
  vi.stubEnv('INGEST_SECRET', 'test-ingest-secret');
  vi.stubEnv('SNIFFER_ENABLED', 'false');
  vi.stubEnv('AGENT_ENABLED', 'true');
  vi.stubEnv('AGENT_ALLOWED_DM_USER_IDS', '111');
  vi.stubEnv('AGENT_PUBLIC_ORIGIN', 'https://chronicler.example');
  vi.stubEnv('BOT_HEARTBEAT_ENABLED', 'false');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

it('stop clears the gateway watchdog so a later non-ready tick does not exit', async () => {
  vi.useFakeTimers();
  const exit = vi.fn();
  const client = scriptedClient();
  const { start } = await import('@discord/session.js');
  const session = await start({ client: client as never, exit });
  await session.stop();
  await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
  expect(exit).not.toHaveBeenCalled();
});

it('terminal disconnect exits and does not reply to an in-flight question', async () => {
  handler = (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/agent/questions') {
      response.writeHead(202);
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/agent/questions/')) {
      response.writeHead(202);
      response.end();
      return;
    }
    response.writeHead(404);
    response.end();
  };
  const exit = vi.fn();
  const reply = vi.fn().mockResolvedValue(undefined);
  const client = scriptedClient();
  const { start } = await import('@discord/session.js');
  await start({ client: client as never, exit });
  client.emit('messageCreate', mention(reply));
  await vi.waitFor(() =>
    expect(seen.some((line) => line.startsWith('GET '))).toBe(true),
  );
  client.emit('shardDisconnect', { code: 4004, reason: '', wasClean: false }, 0);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(exit).toHaveBeenCalledWith(1);
  expect(reply).not.toHaveBeenCalled();
});

it('does not reply when the API completes after stop', async () => {
  const pendingGets: Array<{ response: ServerResponse; jobId: string }> = [];
  handler = (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/agent/questions') {
      response.writeHead(202);
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/agent/questions/')) {
      pendingGets.push({
        response,
        jobId: request.url.slice('/v1/agent/questions/'.length),
      });
      return;
    }
    response.writeHead(404);
    response.end();
  };
  const reply = vi.fn().mockResolvedValue(undefined);
  const client = scriptedClient();
  const { start } = await import('@discord/session.js');
  const session = await start({ client: client as never, exit: vi.fn() });
  client.emit('messageCreate', mention(reply));
  await vi.waitFor(() => expect(pendingGets.length).toBeGreaterThan(0));
  await session.stop();
  for (const { response, jobId } of pendingGets) {
    if (response.writableEnded || response.destroyed) continue;
    try {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ ...completedQuestion('Too late.'), job_id: jobId }),
      );
    } catch {
      // The poll abort may already have closed the socket.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(reply).not.toHaveBeenCalled();
});
