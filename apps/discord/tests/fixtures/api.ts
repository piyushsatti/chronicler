export const jobId = '00000000-0000-4000-8000-000000000001';
export const publicOrigin = 'https://chronicler.example';

export const messageEvent = {
  event_id: '112233445566778899',
  kind: 'message' as const,
  discord_user_id: 'user-1',
  channel_id: 'channel-1',
  occurred_at: '2026-07-01T00:00:00.000Z',
  amount: 1,
};

export const questionRequest = {
  version: 1 as const,
  type: 'question.requested' as const,
  job_id: jobId,
  question: 'What is a Shove action?',
};

export function completedQuestion(answer = 'A supported answer.') {
  return {
    version: 1 as const,
    type: 'question.completed' as const,
    job_id: jobId,
    answer,
    sources: [
      {
        document_id: 'document-1',
        title: 'Rules',
        url: `${publicOrigin}/rules/guides/rules`,
      },
    ],
  };
}
