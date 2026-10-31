import raw from './good.json';
import type { NodeState } from '../../../../src/features/map/nodeState.js';

type RawNode = (typeof raw.pointcrawlNodes)[number];

/** good.json with node states typed as the wire enum; a JSON import widens them to string. */
const good = raw as Omit<typeof raw, 'pointcrawlNodes'> & {
  pointcrawlNodes: (Omit<RawNode, 'state'> & { state: NodeState })[];
};
export default good;
