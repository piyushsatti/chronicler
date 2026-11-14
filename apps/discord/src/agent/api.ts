import type { ApiResponse, HttpPort } from '../api/http.js';
import type { QuestionRequest } from './types.js';

const QUESTIONS_PATH = '/v1/agent/questions';
const MAX_RESULT_BYTES = 64 * 1024;

export type AgentPort = {
  submit(job: QuestionRequest, signal?: AbortSignal): Promise<ApiResponse>;
  poll(jobId: string, signal?: AbortSignal): Promise<ApiResponse>;
};

export function createAgentApi(http: HttpPort): AgentPort {
  return {
    submit(job: QuestionRequest, signal?: AbortSignal): Promise<ApiResponse> {
      return http.request({
        method: 'POST',
        path: QUESTIONS_PATH,
        body: JSON.stringify(job),
        signal,
      });
    },
    poll(jobId: string, signal?: AbortSignal): Promise<ApiResponse> {
      return http.request({
        method: 'GET',
        path: `${QUESTIONS_PATH}/${jobId}`,
        signal,
        maxBytes: MAX_RESULT_BYTES,
      });
    },
  };
}
