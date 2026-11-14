import { featureQueryKeys } from '../chrome/featureRegistry.js';
import type { QueryKeyFactory } from '../chrome/featureModule.js';

export const queryKeys = featureQueryKeys satisfies QueryKeyFactory;
