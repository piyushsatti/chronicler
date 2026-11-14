import type { QuestionCompleted, QuestionResult } from './types.js';

const MAX_DISCORD_CHARS = 1_900;
const MAX_SOURCE_TITLE_CHARS = 160;
const MIN_ANSWER_CHARS = 300;

function escapeDiscordLinkTitle(value: string): string {
  const clipped = value.trim().slice(0, MAX_SOURCE_TITLE_CHARS);
  return clipped
    .replace(/[\\[\]()_*~`>|]/g, '\\$&')
    .replace(/@/g, '@\u200b')
    .replace(/[\r\n]+/g, ' ');
}

const MAX_FAILURE_CHARS = 300;

export function renderQuestionResult(result: QuestionResult): string {
  if (result.type === 'question.failed')
    return result.message.trim().slice(0, MAX_FAILURE_CHARS);
  const body = result.answer.trim();
  const sourceLines = result.sources
    .slice(0, 3)
    .map(
      (source: QuestionCompleted['sources'][number]) =>
        `- [${escapeDiscordLinkTitle(source.title) || 'Source'}](${source.url})`,
    );
  const answerReserve = Math.min(body.length, MIN_ANSWER_CHARS);
  const sources: string[] = [];
  for (const sourceLine of sourceLines) {
    const candidate = `\n\nSources\n${[...sources, sourceLine].join('\n')}`;
    if (candidate.length + answerReserve > MAX_DISCORD_CHARS) break;
    sources.push(sourceLine);
  }
  const suffix = sources.length ? `\n\nSources\n${sources.join('\n')}` : '';
  const room = Math.max(0, MAX_DISCORD_CHARS - suffix.length);
  const clipped =
    body.length > room ? `${body.slice(0, Math.max(0, room - 1)).trimEnd()}…` : body;
  return `${clipped}${suffix}`;
}
