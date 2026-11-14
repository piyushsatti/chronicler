import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { postDiscordEvent } from '@discord/activity/forward.js';
import { submitQuestion } from '@discord/agent/broker.js';
import { postHeartbeat } from '@discord/health.js';
import {
  completedQuestion,
  jobId,
  messageEvent,
  questionRequest,
} from '../fixtures/api.js';
import { testConfig } from '../support/config.js';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let server: Server;
let baseUrl = '';
let config = testConfig();
let handler: Handler = (_request, response) => {
  response.writeHead(404);
  response.end();
};
let requestCount = 0;

beforeEach(async () => {
  requestCount = 0;
  server = createServer((request, response) => {
    requestCount += 1;
    handler(request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  config = testConfig({
    apiUrl: baseUrl,
    agentPublicOrigin: 'https://chronicler.example',
  });
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

it('posts an activity event to ingest once on 200', async () => {
  handler = (request, response) => {
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/v1/ingest/discord-event');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'applied' }));
  };
  await expect(postDiscordEvent(config, messageEvent)).resolves.toBeUndefined();
  expect(requestCount).toBe(1);
});

it('rejects an activity 500 with one request', async () => {
  handler = (_request, response) => {
    response.writeHead(500);
    response.end('boom');
  };
  await expect(postDiscordEvent(config, messageEvent)).rejects.toThrow(/500/);
  expect(requestCount).toBe(1);
});

it('rejects a closed activity connection with one request', async () => {
  handler = (request) => {
    request.socket.destroy();
  };
  await expect(postDiscordEvent(config, messageEvent)).rejects.toThrow();
  expect(requestCount).toBe(1);
});

it('polls a question through 202 then completed', async () => {
  let gets = 0;
  handler = (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/agent/questions') {
      response.writeHead(202);
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === `/v1/agent/questions/${jobId}`) {
      gets += 1;
      if (gets === 1) {
        response.writeHead(202);
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(completedQuestion('A Shove can push a target.')));
      return;
    }
    response.writeHead(404);
    response.end();
  };
  await expect(submitQuestion(config, questionRequest)).resolves.toMatchObject({
    type: 'question.completed',
    job_id: jobId,
    answer: 'A Shove can push a target.',
  });
  expect(gets).toBe(2);
});

it('resolves a question.failed body as a finished result', async () => {
  handler = (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/agent/questions') {
      response.writeHead(202);
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === `/v1/agent/questions/${jobId}`) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          version: 1,
          type: 'question.failed',
          job_id: jobId,
          message: 'No evidence.',
        }),
      );
      return;
    }
    response.writeHead(404);
    response.end();
  };
  await expect(submitQuestion(config, questionRequest)).resolves.toMatchObject({
    type: 'question.failed',
    message: 'No evidence.',
  });
});

it('aborts a pending question poll before the deadline', async () => {
  handler = (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/agent/questions') {
      response.writeHead(202);
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === `/v1/agent/questions/${jobId}`) {
      response.writeHead(202);
      response.end();
      return;
    }
    response.writeHead(404);
    response.end();
  };
  const controller = new AbortController();
  const pending = submitQuestion(config, questionRequest, controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 50));
  controller.abort();
  await expect(pending).rejects.toThrow();
});

it('swallows a heartbeat 500 without throwing', async () => {
  handler = (request, response) => {
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/v1/ingest/heartbeat');
    response.writeHead(500);
    response.end('down');
  };
  await expect(postHeartbeat(config)).resolves.toBeUndefined();
  expect(requestCount).toBe(1);
});
