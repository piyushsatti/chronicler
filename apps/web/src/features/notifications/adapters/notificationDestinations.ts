import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import { documentHref } from '../../../utils/documentHref.js';

export type NotificationDestination =
  { status: 'available'; href: string } | { status: 'unavailable'; reason: string };

type Subject = {
  subjectId: string | null;
  subjectType: string;
  subjectCode: string | null;
};

export type NotificationRequestSession = {
  token: string;
  signal: AbortSignal;
};

const documentSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.string().min(1),
    slug: z.string().min(1),
    category: z.string().nullable(),
  })
  .strict();

function unavailable(reason: string): NotificationDestination {
  return { status: 'unavailable', reason };
}

export function subjectDestination(subject: Subject): NotificationDestination {
  switch (subject.subjectType) {
    case 'character':
      return subject.subjectCode
        ? {
            status: 'available',
            href: `/characters/${encodeURIComponent(subject.subjectCode)}`,
          }
        : unavailable('This character is no longer available.');
    case 'quest':
      return subject.subjectCode
        ? {
            status: 'available',
            href: `/quests/${encodeURIComponent(subject.subjectCode)}`,
          }
        : unavailable('This quest is no longer available.');
    case 'document':
      return unavailable('This document is no longer available.');
    default:
      return unavailable('This notification has no supported destination.');
  }
}

export async function loadDocumentDestinations(
  subjects: readonly Subject[],
  session: NotificationRequestSession,
): Promise<Map<string, NotificationDestination>> {
  const ids = [
    ...new Set(
      subjects
        .filter((subject) => subject.subjectType === 'document')
        .map((subject) => subject.subjectId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const destinations = new Map<string, NotificationDestination>();
  if (ids.length === 0) return destinations;
  if (ids.length > 100 || ids.some((id) => !z.string().uuid().safeParse(id).success)) {
    throw toAppError({ failure: 'InvalidWire' }, 'notifications:destinations');
  }
  // Five selected fields per alias fit the API's complexity limit of 250.
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const variables: Record<string, string> = {};
    const definitions = batch.map((id, index) => {
      variables[`id${index}`] = id;
      return `$id${index}: ID!`;
    });
    // Only fixed field selections and index aliases enter the query text.
    const fields = batch.map(
      (_, index) =>
        `document${index}: documentById(id: $id${index}) { id kind slug category }`,
    );
    session.signal.throwIfAborted();
    const wire = await graphqlRequest<unknown>(
      `query NotificationDocuments(${definitions.join(', ')}) { ${fields.join(' ')} }`,
      variables,
      { signal: session.signal, headers: { Authorization: `Bearer ${session.token}` } },
    );
    const parsed = z.record(z.string(), documentSchema.nullable()).safeParse(wire);
    if (
      !parsed.success ||
      Object.keys(parsed.data).length !== batch.length ||
      batch.some((_, index) => !Object.hasOwn(parsed.data, `document${index}`))
    ) {
      throw toAppError({ failure: 'InvalidWire' }, 'notifications:destinations');
    }
    batch.forEach((id, index) => {
      const document = parsed.data[`document${index}`];
      if (document === null) {
        destinations.set(id, unavailable('This document is no longer available.'));
        return;
      }
      if (document.id !== id) {
        throw toAppError({ failure: 'InvalidWire' }, 'notifications:destinations');
      }
      const subject = subjects.find(
        (item) => item.subjectType === 'document' && item.subjectId === id,
      );
      const href = documentHref({ ...document, questShortCode: subject?.subjectCode });
      destinations.set(
        id,
        href
          ? { status: 'available', href }
          : unavailable(
              document.kind === 'quest_brief'
                ? 'This quest brief has no single current quest destination.'
                : 'This document has no supported reader.',
            ),
      );
    });
  }
  return destinations;
}
