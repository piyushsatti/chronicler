import { z } from 'zod';
import type {
  CloseQuestMutation,
  SignupForQuestMutation,
  WithdrawFromQuestMutation,
  TransitionQuestStatusMutation,
  QuestSelectParticipantsMutation,
  QuestAttestParticipationMutation,
  QuestSetPointcrawlLinksMutation,
  QuestSetArcMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import SIGNUP from './questSignup.graphql?raw';
import WITHDRAW from './questWithdraw.graphql?raw';
import TRANSITION from './questTransition.graphql?raw';
import CLOSE from './questClose.graphql?raw';
import SELECT from './questSelect.graphql?raw';
import ATTEST from './questAttest.graphql?raw';
import POINTCRAWL from './questPointcrawl.graphql?raw';
import ARC from './questArcEdit.graphql?raw';

export type Attendance = { characterId: string; status: 'played' | 'no_show' };
export type Reward = { characterId: string; pcxp: number; note?: string };
export type PointcrawlLink = { pointcrawlNodeId: string; role: 'expected' | 'visited' };
export type QuestCommand =
  | { kind: 'signup' | 'withdraw'; questId: string; characterId: string }
  | { kind: 'transition'; questId: string; to: 'played' | 'cancelled' }
  | { kind: 'select'; questId: string; characterIds: string[] }
  | { kind: 'attest'; questId: string; entries: Attendance[] }
  | { kind: 'close'; questId: string; attendance: Attendance[]; rewards: Reward[] }
  | { kind: 'pointcrawl'; questId: string; links: PointcrawlLink[] }
  | { kind: 'arc'; questId: string; arcId: string | null; expectedUpdatedAt: string };

const participant = z.object({ characterId: z.string().uuid(), status: z.string() });
const quest = z.object({ id: z.string().uuid(), status: z.string() });

export async function executeQuestCommand(
  command: QuestCommand,
  idempotencyKey: string,
): Promise<string> {
  const meta = { idempotencyKey };
  const questId = command.questId;
  try {
    switch (command.kind) {
      case 'signup': {
        const data = await graphqlRequest<SignupForQuestMutation>(SIGNUP, {
          questId,
          characterId: command.characterId,
          meta,
        });
        const result = participant.parse(data.signupForQuest);
        return result.status === 'waitlisted'
          ? 'You joined the waitlist.'
          : 'Your character is signed up.';
      }
      case 'withdraw': {
        const data = await graphqlRequest<WithdrawFromQuestMutation>(WITHDRAW, {
          questId,
          characterId: command.characterId,
          meta,
        });
        participant.parse(data.withdrawFromQuest);
        return 'Your character has withdrawn.';
      }
      case 'transition': {
        const data = await graphqlRequest<TransitionQuestStatusMutation>(TRANSITION, {
          id: questId,
          to: command.to,
          meta,
        });
        quest.parse(data.transitionQuestStatus);
        return command.to === 'played'
          ? 'Session marked played. Record attendance and rewards to close it.'
          : 'Quest cancelled.';
      }
      case 'select': {
        const data = await graphqlRequest<QuestSelectParticipantsMutation>(SELECT, {
          questId,
          characterIds: command.characterIds,
          meta,
        });
        z.array(participant).parse(data.selectQuestParticipants);
        return 'Selected characters have a seat.';
      }
      case 'attest': {
        const data = await graphqlRequest<QuestAttestParticipationMutation>(ATTEST, {
          questId,
          entries: command.entries,
          meta,
        });
        z.array(participant).parse(data.attestQuestParticipation);
        return 'Attendance saved.';
      }
      case 'close': {
        const data = await graphqlRequest<CloseQuestMutation>(CLOSE, {
          id: questId,
          input: { attendance: command.attendance, rewards: command.rewards },
          meta,
        });
        quest.parse(data.closeQuest);
        return 'Quest closed. The recorded PCXP awards are final.';
      }
      case 'pointcrawl': {
        const data = await graphqlRequest<QuestSetPointcrawlLinksMutation>(POINTCRAWL, {
          questId,
          links: command.links,
          meta,
        });
        z.array(
          z.object({ pointcrawlNodeId: z.string().uuid(), role: z.string() }),
        ).parse(data.setQuestPointcrawlLinks);
        return 'Pointcrawl associations saved.';
      }
      case 'arc': {
        const data = await graphqlRequest<QuestSetArcMutation>(ARC, {
          id: questId,
          input: { expectedUpdatedAt: command.expectedUpdatedAt, arcId: command.arcId },
          meta,
        });
        z.object({ id: z.string().uuid(), updatedAt: z.string() }).parse(
          data.updateQuest,
        );
        return 'Quest arc membership saved.';
      }
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'quest:command',
    );
  }
}
