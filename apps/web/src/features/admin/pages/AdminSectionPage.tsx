import { Tabs } from '../../../components/primitives/Tabs.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { AdminWorkspaceShell } from '../AdminWorkspaceShell.js';
import { BackstoriesPanel } from '../components/BackstoriesPanel.js';
import { CharacterDirectoryPanel } from '../components/CharacterDirectoryPanel.js';
import { CreationCatalogPanel } from '../components/CreationCatalogPanel.js';
import { DataHealthPanel } from '../components/DataHealthPanel.js';
import { DeliveryPanel } from '../components/DeliveryPanel.js';
import { GameCalendarPanel } from '../components/GameCalendarPanel.js';
import { HomeBannerPanel } from '../components/HomeBannerPanel.js';
import { MembersPanel } from '../components/MembersPanel.js';
import { RegionsPanel } from '../components/RegionsPanel.js';
import { TimeAnchorPanel } from '../components/TimeAnchorPanel.js';
import {
  useAdminCharactersPage,
  useAdminContentPage,
  useAdminDataHealthPage,
  useAdminDeliveryPage,
  useAdminPeoplePage,
  useAdminWorldPage,
  useDmDashboardPage,
} from '../hooks/useAdminSectionPage.js';

export function AdminSectionPage({
  page,
  title,
  children,
}: {
  page: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <AdminWorkspaceShell page={page} title={title}>
      {children}
    </AdminWorkspaceShell>
  );
}

function PeopleBody(): React.JSX.Element {
  const view = useAdminPeoplePage();
  if (view.status === 'error') return <StatePanel status="error" error={view.error} />;
  if (view.status !== 'ready') return <StatePanel status={view.status} />;
  return <MembersPanel view={view.data} />;
}
export function AdminPeoplePage(): React.JSX.Element {
  return (
    <AdminSectionPage page="admin-people" title="People">
      <PeopleBody />
    </AdminSectionPage>
  );
}

function CharactersBody(): React.JSX.Element {
  return <CharacterDirectoryPanel view={useAdminCharactersPage()} />;
}
export function AdminCharactersPage(): React.JSX.Element {
  return (
    <AdminSectionPage page="admin-characters" title="Characters">
      <CharactersBody />
    </AdminSectionPage>
  );
}

function WorldBody(): React.JSX.Element {
  const view = useAdminWorldPage();
  if (view.status === 'error') return <StatePanel status="error" error={view.error} />;
  if (view.status !== 'ready') return <StatePanel status={view.status} />;
  return (
    <Tabs
      items={[
        {
          id: 'regions',
          label: 'Regions',
          panel: <RegionsPanel view={view.data.regions} />,
        },
        {
          id: 'anchors',
          label: 'Time anchors',
          panel: <TimeAnchorPanel view={view.data.anchors} />,
        },
        {
          id: 'calendar',
          label: 'Calendar',
          panel: <GameCalendarPanel view={view.data.calendar} />,
        },
      ]}
    />
  );
}
export function AdminWorldPage(): React.JSX.Element {
  return (
    <AdminSectionPage page="admin-world" title="World">
      <WorldBody />
    </AdminSectionPage>
  );
}

function ContentBody(): React.JSX.Element {
  const view = useAdminContentPage();
  if (view.status === 'error') return <StatePanel status="error" error={view.error} />;
  if (view.status !== 'ready') return <StatePanel status={view.status} />;
  return (
    <Tabs
      items={[
        {
          id: 'home',
          label: 'Home banner',
          panel: <HomeBannerPanel view={view.data.home} />,
        },
        {
          id: 'backstories',
          label: 'Backstories',
          panel: <BackstoriesPanel view={view.data.backstories} />,
        },
        {
          id: 'catalog',
          label: 'Creation catalog',
          panel: <CreationCatalogPanel view={view.data.catalog} />,
        },
      ]}
    />
  );
}
export function AdminContentPage(): React.JSX.Element {
  return (
    <AdminSectionPage page="admin-content" title="Content">
      <ContentBody />
    </AdminSectionPage>
  );
}

function DeliveryBody(): React.JSX.Element {
  return <DeliveryPanel view={useAdminDeliveryPage()} />;
}
export function AdminDeliveryPage(): React.JSX.Element {
  return (
    <AdminSectionPage page="admin-delivery" title="Delivery">
      <DeliveryBody />
    </AdminSectionPage>
  );
}

function DataHealthBody(): React.JSX.Element {
  return <DataHealthPanel view={useAdminDataHealthPage()} />;
}
export function AdminDataHealthPage(): React.JSX.Element {
  return (
    <AdminSectionPage page="admin-data-health" title="Data health">
      <DataHealthBody />
    </AdminSectionPage>
  );
}

function DmDashboardBody(): React.JSX.Element {
  const view = useDmDashboardPage();
  return <StatePanel status={view.status} error={view.error} />;
}
export function DMDashboardPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="dm-dashboard" title="DM dashboard" authority="dm">
      <DmDashboardBody />
    </AdminWorkspaceShell>
  );
}
