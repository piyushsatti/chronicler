import { EventEmitter } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { ChannelType, PermissionsBitField } from 'discord.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { start } from '@discord/session.js';
import type { ProcessPort } from '@discord/process.js';
import { completedQuestion } from '../fixtures/api.js';
import { testConfig } from '../support/config.js';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

function fakeProcessPort(): ProcessPort & {
  handlers: Map<'SIGTERM' | 'SIGINT', () => void>;
} {
  const handlers = new Map<'SIGTERM' | 'SIGINT', () => void>();
  return {
    handlers,
    onSignal(signal, fn) {
      handlers.set(signal, fn);
    },
    onFatal() {
      return;
    },
    exit: vi.fn(),
  };
}

function scriptedClient() {
  const everyone = {
    id: 'test-guild-id',
    permissions: new PermissionsBitField(['ViewChannel']),
  };
  const voiceChannel = {
    id: 'voice-1',
    type: ChannelType.GuildVoice,
    guild: { id: 'test-guild-id', roles: { everyone } },
    permissionsFor: () => everyone.permissions,
  };
  const channels = new Map([['voice-1', voiceChannel]]);
  const client = new EventEmitter() as EventEmitter & {
    user: { id: string; tag: string };
    login: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    guilds: { cache: Map<string, unknown> };
    channels: { cache: Map<string, unknown> };
    ws: { shards: Map<number, unknown> };
  };
  client.user = { id: 'bot', tag: 'bot#0001' };
  client.login = vi.fn().mockResolvedValue(undefined);
  client.destroy = vi.fn();
  client.guilds = {
    cache: new Map([
      [
        'test-guild-id',
        {
          id: 'test-guild-id',
          available: true,
          voiceStates: { cache: new Map() },
        },
      ],
    ]),
  };
  client.channels = { cache: channels };
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

function voiceJoin() {
  return {
    id: 'user-voice',
    channelId: null,
    guild: { id: 'test-guild-id' },
    member: { user: { bot: false } },
  };
}

function voiceInChannel() {
  return {
    id: 'user-voice',
    channelId: 'voice-1',
    guild: { id: 'test-guild-id' },
    member: { user: { bot: false } },
  };
}

let server: Server;
let config = testConfig();
let handler: Handler = (_request, response) => {
  response.writeHead(404);
  response.end();
};
const seen: string[] = [];
const bodies: unknown[] = [];

beforeEach(async () => {
  seen.length = 0;
  bodies.length = 0;
  server = createServer((request, response) => {
    seen.push(`${request.method} ${request.url}`);
    if (request.method === 'POST') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(chunk as Buffer));
      request.on('end', () => {
        if (chunks.length > 0) {
          try {
            bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            bodies.push(Buffer.concat(chunks).toString('utf8'));
          }
        }
        handler(request, response);
      });
      return;
    }
    handler(request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  config = testConfig({
    apiUrl: `http://127.0.0.1:${address.port}`,
    snifferEnabled: false,
    agentEnabled: true,
    agentAllowedDmUserIds: new Set(['111']),
    agentPublicOrigin: 'https://chronicler.example',
    heartbeatEnabled: false,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

it('stop clears the gateway watchdog so a later non-ready tick does not exit', async () => {
  vi.useFakeTimers();
  const proc = fakeProcessPort();
  const client = scriptedClient();
  const session = await start({
    config,
    client: client as never,
    process: proc,
    installSignalHandlers: false,
  });
  await session.stop();
  await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
  expect(proc.exit).not.toHaveBeenCalled();
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
  const proc = fakeProcessPort();
  const reply = vi.fn().mockResolvedValue(undefined);
  const client = scriptedClient();
  await start({
    config,
    client: client as never,
    process: proc,
    installSignalHandlers: false,
  });
  client.emit('messageCreate', mention(reply));
  await vi.waitFor(() =>
    expect(seen.some((line) => line.startsWith('GET '))).toBe(true),
  );
  client.emit('shardDisconnect', { code: 4004, reason: '', wasClean: false }, 0);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(proc.exit).toHaveBeenCalledWith(1);
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
  const session = await start({
    config,
    client: client as never,
    process: fakeProcessPort(),
    installSignalHandlers: false,
  });
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

it('registers signal handlers before login resolves', async () => {
  const proc = fakeProcessPort();
  const client = scriptedClient();
  let resolveLogin: ((value?: unknown) => void) | undefined;
  client.login = vi.fn(
    () =>
      new Promise((resolve) => {
        expect(proc.handlers.has('SIGTERM')).toBe(true);
        expect(proc.handlers.has('SIGINT')).toBe(true);
        resolveLogin = resolve;
      }),
  );
  const started = start({
    config,
    client: client as never,
    process: proc,
  });
  await vi.waitFor(() => expect(resolveLogin).toBeTypeOf('function'));
  resolveLogin?.();
  await started;
});

it('stop signal posts open voice minutes, destroys, then exits', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
  handler = (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/ingest/discord-event') {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(404);
    response.end();
  };
  const proc = fakeProcessPort();
  const client = scriptedClient();
  config = {
    ...config,
    snifferEnabled: true,
    agentEnabled: false,
    guildId: 'test-guild-id',
  };
  await start({
    config,
    client: client as never,
    process: proc,
  });
  client.emit('shardReady', 0, undefined);
  client.emit('voiceStateUpdate', voiceJoin(), voiceInChannel());
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  const order: string[] = [];
  client.destroy = vi.fn(() => {
    order.push('destroy');
  });
  proc.exit = vi.fn(() => {
    order.push('exit');
  });
  proc.handlers.get('SIGTERM')?.();
  await vi.waitFor(() => expect(order).toContain('exit'));
  expect(order.indexOf('destroy')).toBeLessThan(order.indexOf('exit'));
  await vi.waitFor(() =>
    expect(bodies.some((body) => (body as { kind?: string }).kind === 'voice')).toBe(
      true,
    ),
  );
  const voice = bodies.find((body) => (body as { kind?: string }).kind === 'voice') as {
    amount: number;
    kind: string;
    event_id: string;
  };
  expect(voice.amount).toBe(5);
  expect(voice.event_id).toBe(`voice:user-voice:${Date.parse('2026-07-01T00:00:00.000Z')}`);
});

it('exits by the drain deadline when ingest never answers', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
  handler = () => {
    // Never answers.
  };
  const proc = fakeProcessPort();
  const client = scriptedClient();
  config = {
    ...config,
    snifferEnabled: true,
    agentEnabled: false,
    guildId: 'test-guild-id',
  };
  await start({
    config,
    client: client as never,
    process: proc,
  });
  client.emit('shardReady', 0, undefined);
  client.emit('voiceStateUpdate', voiceJoin(), voiceInChannel());
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  proc.handlers.get('SIGTERM')?.();
  await vi.advanceTimersByTimeAsync(12_000);
  await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0));
  expect(client.destroy).toHaveBeenCalled();
});
