import { DmDashboard } from '../components/DmDashboard.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
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

function SectionIntro({
  label,
  heading,
  caption,
}: {
  label: string;
  heading: string;
  caption: string;
}): React.JSX.Element {
  return (
    <div className="stack" data-gap="2">
      <span className="type-label">{label}</span>
      <h2 className="type-heading">{heading}</h2>
      <p className="type-caption">{caption}</p>
    </div>
  );
}

function PeopleBody(): React.JSX.Element {
  const view = useAdminPeoplePage();
  return (
    <div className="stack">
      <SectionIntro
        label="Directory"
        heading="Members & roles"
        caption="Search the roster and assign staff roles."
      />
      <MembersPanel view={view.data} />
    </div>
  );
}
export function AdminPeoplePage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="admin-people" title="People">
      <PeopleBody />
    </AdminWorkspaceShell>
  );
}

function CharactersBody(): React.JSX.Element {
  return (
    <div className="stack">
      <SectionIntro
        label="Directory"
        heading="Characters"
        caption="Browse campaign characters and open ownership records."
      />
      <CharacterDirectoryPanel view={useAdminCharactersPage()} />
    </div>
  );
}
export function AdminCharactersPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="admin-characters" title="Characters">
      <CharactersBody />
    </AdminWorkspaceShell>
  );
}

function WorldBody(): React.JSX.Element {
  const view = useAdminWorldPage();
  return (
    <div className="stack">
      <SectionIntro
        label="World"
        heading="Regions, anchors, calendar"
        caption="Maintain geography, timeline anchors, and the game calendar."
      />
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
    </div>
  );
}
export function AdminWorldPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="admin-world" title="World">
      <WorldBody />
    </AdminWorkspaceShell>
  );
}

function ContentBody(): React.JSX.Element {
  const view = useAdminContentPage();
  return (
    <div className="stack">
      <SectionIntro
        label="Content"
        heading="Site surfaces"
        caption="Edit the home banner, backstories, and creation catalog."
      />
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
    </div>
  );
}
export function AdminContentPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="admin-content" title="Content">
      <ContentBody />
    </AdminWorkspaceShell>
  );
}

function DeliveryBody(): React.JSX.Element {
  return (
    <div className="stack">
      <SectionIntro
        label="Delivery"
        heading="Discord delivery"
        caption="Watch pending jobs and active delivery alerts."
      />
      <DeliveryPanel view={useAdminDeliveryPage()} />
    </div>
  );
}
export function AdminDeliveryPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="admin-delivery" title="Delivery">
      <DeliveryBody />
    </AdminWorkspaceShell>
  );
}

function DataHealthBody(): React.JSX.Element {
  return (
    <div className="stack">
      <SectionIntro
        label="Integrity"
        heading="Data health"
        caption="Watchdog alerts and remediation surfaces from live operations."
      />
      <DataHealthPanel view={useAdminDataHealthPage()} />
    </div>
  );
}
export function AdminDataHealthPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="admin-data-health" title="Data health">
      <DataHealthBody />
    </AdminWorkspaceShell>
  );
}

function DmDashboardBody(): React.JSX.Element {
  const view = useDmDashboardPage();
  return <DmDashboard view={view} />;
}
export function DMDashboardPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="dm-dashboard" title="DM dashboard" authority="dm">
      <DmDashboardBody />
    </AdminWorkspaceShell>
  );
}
