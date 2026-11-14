import type { ApiResponse, HttpPort } from './http.js';

const EVENT_PATH = '/v1/ingest/discord-event';
const HEARTBEAT_PATH = '/v1/ingest/heartbeat';

export type IngestPort = {
  postEvent(event: unknown): Promise<ApiResponse>;
  postHeartbeat(status: unknown): Promise<ApiResponse>;
};

export function createIngest(http: HttpPort): IngestPort {
  return {
    postEvent(event: unknown): Promise<ApiResponse> {
      return http.request({
        method: 'POST',
        path: EVENT_PATH,
        body: JSON.stringify(event),
      });
    },
    postHeartbeat(status: unknown): Promise<ApiResponse> {
      return http.request({
        method: 'POST',
        path: HEARTBEAT_PATH,
        body: JSON.stringify(status),
      });
    },
  };
}
