import { z } from 'zod';
import type {
  CharacterActivityQuery,
  AdjustPcxpMutation,
  LogCharacterEventMutation,
  UpsertDowntimeProjectMutation,
  UpsertDowntimeProjectMutationVariables,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import ACTIVITY from './characterActivity.graphql?raw';
import ADJUST from './adjustPcxp.graphql?raw';
import LOG from './logCharacterEvent.graphql?raw';
import DOWNTIME from './upsertDowntimeProject.graphql?raw';

const project = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  goal: z.string().nullable(),
  progress: z.number().int(),
  target: z.number().int().nullable(),
  status: z.string(),
  notes: z.string().nullable(),
  updatedAt: z.string(),
});
const activity = z.object({
  characterLogs: z.object({
    items: z.array(
      z.object({ id: z.string().uuid(), body: z.string(), createdAt: z.string() }),
    ),
    total: z.number().int().nonnegative(),
  }),
  downtimeProjects: z.object({
    items: z.array(project),
    total: z.number().int().nonnegative(),
  }),
});
export type CharacterActivity = z.infer<typeof activity>;
export type DowntimeProject = z.infer<typeof project>;
export type ActivityCommand =
  | { kind: 'xp'; amount: number; note: string }
  | { kind: 'log'; body: string }
  | { kind: 'downtime'; input: UpsertDowntimeProjectMutationVariables['input'] };
export const ACTIVITY_PAGE_SIZE = 20;
export async function loadCharacterActivity(
  characterId: string,
  offset: number,
): Promise<CharacterActivity> {
  const data = await graphqlRequest<CharacterActivityQuery>(ACTIVITY, {
    characterId,
    limit: ACTIVITY_PAGE_SIZE,
    offset,
  });
  const parsed = activity.safeParse(data);
  if (!parsed.success)
    throw toAppError({ failure: 'InvalidWire' }, 'character:activity');
  return parsed.data;
}
export async function writeCharacterActivity(
  characterId: string,
  command: ActivityCommand,
  idempotencyKey: string,
): Promise<void> {
  const meta = { idempotencyKey };
  switch (command.kind) {
    case 'xp': {
      const data = await graphqlRequest<AdjustPcxpMutation>(ADJUST, {
        characterId,
        amount: command.amount,
        note: command.note,
        meta,
      });
      z.object({ id: z.string().uuid() }).parse(data.adjustPcxp);
      return;
    }
    case 'log': {
      const data = await graphqlRequest<LogCharacterEventMutation>(LOG, {
        characterId,
        body: command.body,
        meta,
      });
      z.object({ id: z.string().uuid() }).parse(data.logCharacterEvent);
      return;
    }
    case 'downtime': {
      const data = await graphqlRequest<UpsertDowntimeProjectMutation>(DOWNTIME, {
        characterId,
        input: command.input,
        meta,
      });
      z.object({ id: z.string().uuid() }).parse(data.upsertDowntimeProject);
      return;
    }
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}
