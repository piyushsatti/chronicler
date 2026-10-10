export interface QuestionRequest {
  version: 1;
  type: 'question.requested';
  job_id: string;
  question: string;
  history?: QuestionHistory;
}

export interface QuestionHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface QuestionHistory {
  messages: QuestionHistoryMessage[];
  incomplete: boolean;
}

export interface QuestionSource {
  document_id: string;
  title: string;
  url: string;
}

export interface QuestionCompleted {
  version: 1;
  type: 'question.completed';
  job_id: string;
  answer: string;
  sources: QuestionSource[];
}

export interface QuestionFailed {
  version: 1;
  type: 'question.failed';
  job_id: string;
  message: string;
}

export type QuestionResult = QuestionCompleted | QuestionFailed;

export interface NormalizedMention {
  job: QuestionRequest;
  sourceMessageId: string;
  authorId: string;
  guildId: string;
}
