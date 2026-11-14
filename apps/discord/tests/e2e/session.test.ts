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
import { completedQuestion } from '../fixtures/api.js';
import { testConfig } from '../support/config.js';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let server: Server;
let config = testConfig();
let handler: Handler = (_request, response) => {
  response.writeHead(404);
  response.end();
};
const posts: string[] = [];

function scriptedClient() {
  const client = new EventEmitter() as EventEmitter & {
    user: { id: string; tag: string };
    login: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    once: EventEmitter['once'];
    guilds: { cache: { size: number } };
    channels: { cache: Map<string, unknown> };
    ws: { shards: Map<number, unknown> };
  };
  client.user = { id: 'bot', tag: 'bot#0001' };
  client.login = vi.fn().mockResolvedValue(undefined);
  client.destroy = vi.fn();
  client.guilds = { cache: { size: 1 } };
  // Activity is forwarded only from channels everyone can view (finding 32).
  const everyone = {
    id: 'test-guild-id',
    permissions: new PermissionsBitField(['ViewChannel']),
  };
  client.channels = {
    cache: new Map([
      [
        'channel-1',
        {
          id: 'channel-1',
          type: ChannelType.GuildText,
          guild: { id: 'test-guild-id', roles: { everyone } },
          permissionsFor: () => everyone.permissions,
        },
      ],
    ]),
  };
  client.ws = { shards: new Map([[0, {}]]) };
  return client;
}

function mentionMessage(reply: ReturnType<typeof vi.fn>) {
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

function guildMessage() {
  return {
    id: '112233445566778899',
    guildId: 'test-guild-id',
    channelId: 'channel-1',
    author: { id: 'user-1', bot: false },
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    channel: { id: 'channel-1' },
  };
}

beforeEach(async () => {
  posts.length = 0;
  server = createServer((request, response) => {
    posts.push(`${request.method} ${request.url}`);
    handler(request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  config = testConfig({
    apiUrl: `http://127.0.0.1:${address.port}`,
    heartbeatEnabled: false,
    snifferEnabled: true,
    agentEnabled: true,
    agentAllowedDmUserIds: new Set(['111']),
    agentPublicOrigin: 'https://chronicler.example',
  });
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

it('stays up when ingest returns 500 and still posts the next message', async () => {
  let status = 500;
  handler = (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/ingest/discord-event') {
      response.writeHead(status);
      response.end(status === 200 ? '{}' : 'down');
      return;
    }
    response.writeHead(404);
    response.end();
  };
  const exit = vi.fn();
  const client = scriptedClient();
  const session = await start({
    config,
    client: client as never,
    exit,
    installSignalHandlers: false,
  });
  client.emit('messageCreate', guildMessage());
  await vi.waitFor(() =>
    expect(posts.filter((p) => p.includes('discord-event'))).toHaveLength(1),
  );
  status = 200;
  client.emit('messageCreate', {
    ...guildMessage(),
    id: '112233445566778800',
  });
  await vi.waitFor(() =>
    expect(posts.filter((p) => p.includes('discord-event'))).toHaveLength(2),
  );
  expect(exit).not.toHaveBeenCalled();
  await session.stop();
});

it('replies with failure when questions return 500 and accepts a second mention', async () => {
  let rejects = true;
  handler = (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/agent/questions') {
      if (rejects) {
        response.writeHead(500);
        response.end('down');
        return;
      }
      response.writeHead(202);
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/agent/questions/')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      const id = request.url.slice('/v1/agent/questions/'.length);
      response.end(
        JSON.stringify({
          ...completedQuestion('Done.'),
          job_id: id,
        }),
      );
      return;
    }
    response.writeHead(404);
    response.end();
  };
  const exit = vi.fn();
  const client = scriptedClient();
  const session = await start({
    config,
    client: client as never,
    exit,
    installSignalHandlers: false,
  });
  const reply = vi.fn().mockResolvedValue(undefined);
  client.emit('messageCreate', mentionMessage(reply));
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("couldn't finish"),
      }),
    ),
  );
  rejects = false;
  reply.mockClear();
  const second = mentionMessage(reply);
  second.id = 'message-2';
  second.content = '<@bot> What is dash?';
  client.emit('messageCreate', second);
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Done'),
      }),
    ),
  );
  expect(exit).not.toHaveBeenCalled();
  await session.stop();
});

it('aborts an in-flight poll on stop without a failure reply', async () => {
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
  const client = scriptedClient();
  const session = await start({
    config,
    client: client as never,
    exit: vi.fn(),
    installSignalHandlers: false,
  });
  const reply = vi.fn().mockResolvedValue(undefined);
  client.emit('messageCreate', mentionMessage(reply));
  await vi.waitFor(() => expect(posts.some((p) => p.startsWith('GET '))).toBe(true));
  await session.stop();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(reply).not.toHaveBeenCalled();
});

it('exits on terminal shardDisconnect without flushing', async () => {
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
  await start({
    config,
    client: client as never,
    exit,
    installSignalHandlers: false,
  });
  client.emit('messageCreate', mentionMessage(reply));
  await vi.waitFor(() =>
    expect(posts.some((entry) => entry.startsWith('GET '))).toBe(true),
  );
  client.emit('shardDisconnect', { code: 4004, reason: '', wasClean: false }, 0);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(exit).toHaveBeenCalledWith(1);
  expect(reply).not.toHaveBeenCalled();
});
