/** Generated REST types for the Go /v1 API (maintain via `bun run codegen:openapi`). */

export type paths = {
  '/v1/stats': {
    get: {
      responses: { 200: { content: { 'application/json': { totalMembers: number } } } };
    };
  };
  '/v1/members/me': {
    get: {
      responses: { 200: { content: { 'application/json': Record<string, unknown> } } };
    };
  };
  '/v1/quests/{id}/transition': {
    post: {
      parameters: { path: { id: string } };
      requestBody: { content: { 'application/json': { to: string } } };
      responses: {
        200: { content: { 'application/json': { id: string; status: string } } };
      };
    };
  };
};
