import { z } from 'zod';
import type { EditorVoiceChannelsQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import VOICE_CHANNELS from './editorVoiceChannels.graphql?raw';

const voiceChannelSchema = z.object({
  name: z.string(),
  channelId: z.string().regex(/^[0-9]{17,20}$/),
});
export type EditorVoiceChannel = { name: string; channelId: string };

/** field-routing: questVoiceChannels → GraphQL Query.questVoiceChannels. The voice
 * channels an admin listed under Admin, Delivery; a DM picks one for a quest. */
export async function loadEditorVoiceChannels(): Promise<EditorVoiceChannel[]> {
  try {
    const wire = await graphqlRequest<EditorVoiceChannelsQuery>(VOICE_CHANNELS, {});
    return z.array(voiceChannelSchema).parse(wire.questVoiceChannels);
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'editor:voice-channels',
    );
  }
}
