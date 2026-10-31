import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { DmDashboard } from '../components/DmDashboard.js';
import { SectionSwitch } from '../components/SectionSwitch.js';
import { AdminWorkspaceShell } from '../AdminWorkspaceShell.js';
import { BackstoriesPanel } from '../components/BackstoriesPanel.js';
import { CharacterDirectoryPanel } from '../components/CharacterDirectoryPanel.js';
import { CreationCatalogPanel } from '../components/CreationCatalogPanel.js';
import { DataHealthPanel } from '../components/DataHealthPanel.js';
import { DeliveryPanel } from '../components/DeliveryPanel.js';
import { DiscordSettingsPanel } from '../components/DiscordSettingsPanel.js';
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
  useDiscordSettingsPage,
  useAdminPeoplePage,
  useAdminWorldPage,
  useDmDashboardPage,
} from '../hooks/useAdminSectionPage.js';

function PeopleBody(): React.JSX.Element {
  const view = useAdminPeoplePage();
  return (
    <div className="stack">
      <MembersPanel view={view.data} />
    </div>
  );
}
export function AdminPeoplePage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell
      page="admin-people"
      title="People"
      lede="Search members and give them staff roles."
    >
      <PeopleBody />
    </AdminWorkspaceShell>
  );
}

function CharactersBody(): React.JSX.Element {
  return (
    <div className="stack">
      <CharacterDirectoryPanel view={useAdminCharactersPage()} />
    </div>
  );
}
export function AdminCharactersPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell
      page="admin-characters"
      title="Characters"
      lede="Browse every character and open their records."
    >
      <CharactersBody />
    </AdminWorkspaceShell>
  );
}

function WorldBody(): React.JSX.Element {
  const view = useAdminWorldPage();
  return (
    <div className="stack">
      <SectionSwitch
        label="World sections"
        items={[
          {
            id: 'regions',
            label: 'Regions',
            count: view.data.regions.regions.data
              ? `${view.data.regions.regions.data.length}${view.data.regions.pagination.hasNext || view.data.regions.pagination.offset ? ' on page' : ''}`
              : null,
            filters: (
              <FilterBar.Picker
                label="Region kind"
                value={view.data.regions.filterKind}
                onValueChange={view.data.regions.setFilterKind}
                options={[
                  { value: '', label: 'All kinds' },
                  { value: 'uncharted', label: 'Uncharted' },
                  { value: 'archon', label: 'Archon' },
                  { value: 'server', label: 'Server' },
                ]}
              />
            ),
            panel: <RegionsPanel view={view.data.regions} showFilters={false} />,
          },
          {
            id: 'anchors',
            label: 'Time anchors',
            count: view.data.anchors.pagination.total,
            panel: <TimeAnchorPanel view={view.data.anchors} />,
          },
          {
            id: 'calendar',
            label: 'Calendar',
            count: view.data.calendar.calendar.data ? 1 : null,
            panel: <GameCalendarPanel view={view.data.calendar} />,
          },
        ]}
      />
    </div>
  );
}
export function AdminWorldPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell
      page="admin-world"
      title="World"
      lede="Maintain regions, time anchors and the game calendar."
    >
      <WorldBody />
    </AdminWorkspaceShell>
  );
}

function ContentBody(): React.JSX.Element {
  const view = useAdminContentPage();
  return (
    <div className="stack">
      <SectionSwitch
        label="Content sections"
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
    <AdminWorkspaceShell
      page="admin-content"
      title="Content"
      lede="Edit the home banner, backstories and the creation catalog."
    >
      <ContentBody />
    </AdminWorkspaceShell>
  );
}

function DeliveryBody(): React.JSX.Element {
  const delivery = useAdminDeliveryPage();
  const discord = useDiscordSettingsPage();
  return (
    <div className="stack">
      <SectionSwitch
        label="Delivery sections"
        items={[
          {
            id: 'status',
            label: 'Delivery status',
            panel: <DeliveryPanel view={delivery} />,
          },
          {
            id: 'discord',
            label: 'Discord settings',
            panel: <DiscordSettingsPanel view={discord} />,
          },
        ]}
      />
    </div>
  );
}
export function AdminDeliveryPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell
      page="admin-delivery"
      title="Delivery"
      lede="Check that quests reach Discord, see what needs attention, and set where announcements go."
    >
      <DeliveryBody />
    </AdminWorkspaceShell>
  );
}

function DataHealthBody(): React.JSX.Element {
  return (
    <div className="stack">
      <DataHealthPanel view={useAdminDataHealthPage()} />
    </div>
  );
}
export function AdminDataHealthPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell
      page="admin-data-health"
      title="Data health"
      lede="Background jobs and the bot report their problems here."
    >
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
    <AdminWorkspaceShell
      page="dm-dashboard"
      title="DM dashboard"
      authority="dm"
      bareHeader
    >
      <DmDashboardBody />
    </AdminWorkspaceShell>
  );
}
