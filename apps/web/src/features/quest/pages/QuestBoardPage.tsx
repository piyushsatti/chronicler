import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost } from '@pi/react-imposition/react';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { QuestBoardView } from '../components/QuestBoardView.js';
import { useQuestBoardPage } from '../hooks/useQuestBoardPage.js';

const DECLARATION: PageDeclaration = {
  page: 'quest-board',
  regions: [{ role: 'body', priority: 1 }],
};

export function QuestBoardPage(): React.JSX.Element {
  const page = useQuestBoardPage();
  return (
    <PageShell context="tavern" max="wide" className="hf2">
      <PageHost
        declaration={DECLARATION}
        regions={{ body: () => <QuestBoardView {...page} /> }}
      />
    </PageShell>
  );
}
