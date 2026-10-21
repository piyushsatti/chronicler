import { Chip, Table } from '@pi/chronicler-ds';

type Quest = { code: string; title: string; dm: string; seats: string; status: string; when: string };

const quests: Quest[] = [
  { code: 'Q-0147', title: 'The Drowned Bell of Saltmere', dm: 'Ilse Varrow', seats: '4 / 6', status: 'Open', when: 'Sat 17 Oct · 19:00' },
  { code: 'Q-0152', title: 'Ashes over the Ember Pass', dm: 'Corwin Hale', seats: '6 / 6', status: 'Full', when: 'Sun 18 Oct · 15:00' },
  { code: 'Q-0158', title: 'The Lantern Abbey Vigil', dm: 'Morwen Ashby', seats: '2 / 5', status: 'Open', when: 'Wed 21 Oct · 20:00' },
  { code: 'Q-0161', title: 'Smugglers of the Salt Stair', dm: 'Ilse Varrow', seats: '3 / 4', status: 'Draft', when: 'Fri 23 Oct · 19:30' },
];

const columns = [
  { key: 'code', label: 'Code', sortable: true, width: '90px' },
  { key: 'title', label: 'Quest', sortable: true },
  { key: 'dm', label: 'DM' },
  { key: 'when', label: 'Scheduled', sortable: true },
  { key: 'seats', label: 'Seats', align: 'end' as const },
  {
    key: 'status',
    label: 'Status',
    render: (row: Quest) => <Chip tone="status">{row.status}</Chip>,
  },
];

export function QuestBoard() {
  return <Table columns={columns} rows={quests} rowKey={(row: Quest) => row.code} />;
}

export function SortedDescending() {
  const sorted = [...quests].sort((a, b) => b.code.localeCompare(a.code));
  return (
    <Table
      columns={columns}
      rows={sorted}
      rowKey={(row: Quest) => row.code}
      defaultSortKey="code"
      defaultSortDir="desc"
    />
  );
}

export function Loading() {
  return <Table columns={columns} rows={[]} loading />;
}

export function Empty() {
  return (
    <Table
      columns={columns}
      rows={[]}
      empty={<p className="type-caption">No quests scheduled for this week. Post one from the DM dashboard.</p>}
    />
  );
}
