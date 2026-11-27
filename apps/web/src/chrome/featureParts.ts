import * as admin from '../features/admin/parts.js';
import * as character from '../features/character/parts.js';
import * as member from '../features/member/parts.js';
import * as notifications from '../features/notifications/parts.js';
import * as personalize from '../features/personalize/parts.js';
import * as profile from '../features/profile/parts.js';
import * as search from '../features/search/parts.js';
import { mergeFeatureParts } from './featureModule.js';

/**
 * The parts each feature hands to the chrome, shared hooks and other features.
 * Code outside a feature reaches it only through here (or the routes and keys in
 * featureRegistry), so check:boundary needs no exceptions. Read parts at render
 * time, not at module load: pages import this module and this module imports
 * feature code, so a top-level read can run before a part is defined.
 */
export const featureParts = mergeFeatureParts([
  admin,
  character,
  member,
  notifications,
  personalize,
  profile,
  search,
] as const);
