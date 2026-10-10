import { z } from 'zod';

export const memberMeWireSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  roles: z.array(z.string()),
});

export type MemberMeWire = z.infer<typeof memberMeWireSchema>;
