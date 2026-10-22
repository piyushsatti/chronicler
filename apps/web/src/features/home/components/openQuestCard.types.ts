import type { QuestCardStatus } from '../../../view-models/questCard.js';

export type OpenQuestPartyMember = {
  name: string;
  avatarUrl?: string;
  state?: 'confirmed' | 'tentative' | 'waitlisted';
};

export interface OpenQuestCardProps {
  code: string;
  title: string;
  description?: string | null;
  region?: string;
  status: QuestCardStatus;
  gw?: boolean;
  cancelled?: boolean;
  dm: {
    name: string;
    avatarUrl?: string;
  };
  dmFam?: number | null;
  party: OpenQuestPartyMember[];
  totalSlots: number;
  level?: string | null;
  when?: string | null;
  mine?: boolean;
  waitlisted?: boolean;
  animIndex?: number;
  onClick?: () => void;
  isMutating?: boolean;
  onWithdrawConfirm?: () => void;
}
