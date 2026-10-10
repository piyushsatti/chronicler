import { Link } from 'react-router-dom';

export type QuestCardView = {
  shortCode: string;
  title: string;
  status: string;
  slotsMax: number;
  filledCount: number;
  dmName: string | null;
  discordDelivery: {
    desiredRevision: number;
    appliedRevision: number;
    overallStatus: string;
    isTerminal: boolean;
  };
};

export function QuestCard({ quest }: { quest: QuestCardView }): React.JSX.Element {
  const delivery = quest.discordDelivery;
  return (
    <article className="card stack">
      <Link className="type-title" to={`/quests/${quest.shortCode}`}>
        {quest.title}
      </Link>
      <p className="type-caption">
        {quest.shortCode} · {quest.status}
      </p>
      <p className="type-caption">
        {quest.filledCount}/{quest.slotsMax} seats
        {quest.dmName ? ` · DM ${quest.dmName}` : ''}
      </p>
      <p className="type-caption">
        Discord:{' '}
        {delivery.isTerminal
          ? delivery.overallStatus
          : `${delivery.overallStatus} (${delivery.appliedRevision}/${delivery.desiredRevision})`}
      </p>
    </article>
  );
}
