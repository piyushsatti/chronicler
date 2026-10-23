import { Motion } from '../sections/Motion.js';
import { Effects } from '../sections/Effects.js';
import { Cosmetics } from '../sections/Cosmetics.js';
import type { ReactNode } from 'react';
import { createElement, useState } from 'react';
import { Field } from '../../../components/foundation/Field.js';
import { StatusBadge } from '../../../components/foundation/StatusBadge.js';
import { StubNotice } from '../../../components/foundation/StubNotice.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { AvatarGroup } from '../../../components/primitives/AvatarGroup.js';
import { Button } from '../../../components/primitives/Button.js';
import { Calendar } from '../../../components/primitives/Calendar.js';
import { Card } from '../../../components/primitives/Card.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { ColorSwatch } from '../../../components/primitives/ColorSwatch.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { ErrorState } from '../../../components/primitives/ErrorState.js';
import { FieldDateTime } from '../../../components/primitives/FieldDateTime.js';
import { Legend } from '../../../components/primitives/Legend.js';
import { Listbox } from '../../../components/primitives/Listbox.js';
import { ListRow } from '../../../components/primitives/ListRow.js';
import { MasterDetail } from '../../../components/primitives/MasterDetail.js';
import { Menu } from '../../../components/primitives/Menu.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { Popover } from '../../../components/primitives/Popover.js';
import { SegmentedControl } from '../../../components/primitives/SegmentedControl.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { SplitPane } from '../../../components/primitives/SplitPane.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { Table } from '../../../components/primitives/Table.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { Toast } from '../../../components/primitives/Toast.js';
import { useToast } from '../../../hooks/useToast.js';
import { WeekGrid } from '../../../components/primitives/WeekGrid.js';
import { DateTimePicker } from '../../../components/interactive/DateTimePicker.js';
import { useAppSelector } from '../../../store/hooks.js';

type GalleryEntry = {
  id: string;
  title: string;
  section: 'primitives' | 'identity' | 'motion' | 'effects';
  layout?: 'full';
  render: () => ReactNode;
};

function ButtonDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'row', 'data-wrap': '1' },
    createElement(Button, { variant: 'primary' }, 'Primary'),
    createElement(Button, { variant: 'secondary' }, 'Secondary'),
    createElement(Button, { variant: 'ghost' }, 'Ghost'),
    createElement(Button, { variant: 'danger' }, 'Danger'),
    createElement(Button, { size: 'sm' }, 'Small'),
    createElement(Button, { size: 'lg' }, 'Large'),
    createElement(Button, { disabled: true }, 'Disabled'),
  );
}

function ChipDemo(): React.JSX.Element {
  return createElement(
    Chip.Row,
    null,
    createElement(Chip, { tone: 'accent', selected: true }, 'Selected'),
    createElement(Chip, { tone: 'status' }, 'Status'),
    createElement(Chip, { tone: 'line' }, 'Line'),
    createElement(Chip, null, 'Idle'),
  );
}

function CardDemo(): React.JSX.Element {
  return createElement(
    Card,
    { className: 'stack' },
    createElement('h3', { className: 'type-heading' }, 'Card surface'),
    createElement(
      'p',
      { className: 'type-body' },
      'A default card with a heading and supporting content.',
    ),
  );
}

function TabsDemo(): React.JSX.Element {
  return createElement(Tabs, {
    items: [
      {
        id: 'a',
        label: 'Alpha',
        panel: createElement('p', { className: 'type-body' }, 'Alpha panel'),
      },
      {
        id: 'b',
        label: 'Beta',
        panel: createElement('p', { className: 'type-body' }, 'Beta panel'),
      },
    ],
  });
}

function PageHeaderDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'stack', 'data-gap': '6' },
    createElement(PageHeader, {
      level: 2,
      title: 'Community',
      lede: "See who's free, find a table, and browse everyone on the server.",
      meta: '42 members',
      actions: createElement(Button, { variant: 'primary', size: 'sm' }, 'New entry'),
    }),
    createElement(PageHeader, {
      level: 2,
      back: { to: '/codex', label: 'Codex' },
      title: 'Lightfall Coast',
      meta: 'Updated 19 Oct 2026 by Sable Vey',
    }),
  );
}

function DetailLayoutDemo(): React.JSX.Element {
  return createElement(DetailLayout, {
    railLabel: 'About this entry',
    rail: createElement(Card, { pad: 4 }, 'Related links sit in the rail.'),
    children: createElement(DetailLayout.Reading, {
      children: createElement(
        'p',
        { className: 'type-narrative' },
        'The prose body sits in the reading column; tables and cards use the full main column.',
      ),
    }),
  });
}

function FilterBarDemo(): React.JSX.Element {
  const [author, setAuthor] = useState('all');
  return createElement(
    FilterBar,
    { label: 'Filter entries', count: '24 entries' },
    createElement(FilterBar.Search, {
      label: 'Search entries',
      placeholder: 'Search entries',
    }),
    createElement(
      FilterBar.Group,
      { label: 'Author' },
      ...['all', 'mine', 'dms'].map((value) =>
        createElement(
          Chip,
          { key: value, selected: author === value, onClick: () => setAuthor(value) },
          value,
        ),
      ),
    ),
  );
}

function CardGridDemo(): React.JSX.Element {
  return createElement(
    CardGrid,
    { as: 'ul', 'aria-label': 'Demo cards' },
    ...['One', 'Two', 'Three', 'Four'].map((label) =>
      createElement('li', { key: label }, createElement(Card, { pad: 4 }, label)),
    ),
  );
}

function EmptyDemo(): React.JSX.Element {
  return createElement(EmptyState, {
    kind: 'no-quests',
    message: 'No quests match these filters.',
    actionLabel: 'Clear filters',
    onAction: () => undefined,
  });
}

function ErrorDemo(): React.JSX.Element {
  return createElement(ErrorState, {
    title: 'Couldn’t load this',
    message: 'Check your connection and try again.',
    onRetry: () => undefined,
  });
}

function FieldDemo(): React.JSX.Element {
  return createElement(Field, {
    label: 'Label',
    defaultValue: 'Field value',
    'aria-label': 'Gallery field',
  });
}

function ModalDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return createElement(
    'div',
    { className: 'stack' },
    createElement(
      Button,
      { type: 'button', onClick: () => setOpen(true) },
      'Open modal',
    ),
    createElement(
      Modal,
      { open, title: 'Gallery modal', onClose: () => setOpen(false) },
      createElement('p', { className: 'type-body' }, 'Modal body content.'),
    ),
  );
}

function TypeScaleDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'stack' },
    createElement('p', { className: 'type-display' }, 'Display'),
    createElement('p', { className: 'type-heading' }, 'Heading'),
    createElement('p', { className: 'type-title' }, 'Title'),
    createElement('p', { className: 'type-body' }, 'Body'),
    createElement('p', { className: 'type-caption' }, 'Caption'),
    createElement('p', { className: 'type-label' }, 'Label'),
  );
}

function TokenSheetDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'row', 'data-wrap': '1' },
    ['--color-bg', '--color-text', '--color-accent', '--color-border'].map((token) =>
      createElement(
        'div',
        {
          key: token,
          className: 'card stack',
          style: {
            minWidth: 120,
            background: `var(${token}, var(--color-bg-surface))`,
          },
        },
        createElement('code', { className: 'type-caption' }, token),
      ),
    ),
  );
}

function ToastDemo(): React.JSX.Element {
  const { addToast } = useToast();
  const items = useAppSelector((s) => s.toasts.items);
  return createElement(
    'div',
    { className: 'stack', 'data-el': 'gallery.toast' },
    createElement(
      'div',
      { className: 'row', 'data-wrap': '1' },
      createElement(
        Button,
        { type: 'button', onClick: () => addToast('Info toast', 'info') },
        'Info',
      ),
      createElement(
        Button,
        {
          type: 'button',
          onClick: () => addToast('Success toast', 'success'),
        },
        'Success',
      ),
      createElement(
        Button,
        { type: 'button', onClick: () => addToast('Error toast', 'error') },
        'Error',
      ),
    ),
    createElement(Toast, { tone: 'info' }, 'An informational message.'),
    items.length
      ? createElement(
          'ul',
          { className: 'stack' },
          ...items.map((t) =>
            createElement(
              'li',
              { key: t.id, className: 'type-caption', 'data-tone': t.tone },
              t.message,
            ),
          ),
        )
      : createElement('p', { className: 'type-caption' }, 'No live toasts yet.'),
  );
}

function StatusBadgeDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'row', 'data-wrap': '1' },
    createElement(StatusBadge, { status: 'active' }),
    createElement(StatusBadge, { status: 'pending_approval' }),
    createElement(StatusBadge, { status: 'open' }),
    createElement(StatusBadge, { status: 'live' }),
    createElement(StatusBadge, { status: 'closed' }),
  );
}

function PopoverDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return createElement(Popover, {
    open,
    onOpenChange: setOpen,
    ariaLabel: 'Gallery popover',
    trigger: createElement('span', null, open ? 'Hide popover' : 'Show popover'),
    children: createElement('p', { className: 'type-body' }, 'Popover surface demo.'),
  });
}

function MenuDemo(): React.JSX.Element {
  const [picked, setPicked] = useState('Nothing picked yet');
  return createElement(
    'div',
    { className: 'row', 'data-wrap': '1' },
    createElement(Menu, {
      ariaLabel: 'Gallery menu',
      trigger: createElement('span', { className: 'btn' }, 'Open menu'),
      items: ['Ember', 'Midnight', 'Parchment'].map((name) => ({
        key: name,
        label: name,
        onSelect: () => setPicked(`Picked ${name}`),
      })),
    }),
    createElement(Menu, {
      ariaLabel: 'Empty gallery menu',
      trigger: createElement('span', { className: 'btn' }, 'Empty menu'),
      items: [],
      emptyLabel: createElement('p', { className: 'type-caption' }, 'No more options'),
    }),
    createElement('span', { className: 'type-caption' }, picked),
  );
}

function SkeletonDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'stack', 'data-el': 'gallery.skeleton' },
    createElement(Skeleton, { height: 16, width: '60%' }),
    createElement(Skeleton, { height: 16, width: '40%' }),
    createElement('p', { className: 'type-caption' }, 'Skeleton placeholders'),
  );
}

function AvatarDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'row', 'data-wrap': '1' },
    createElement(Avatar, { name: 'Kael Storm', size: 'md' }),
    createElement(Avatar, { name: 'DM', size: 'sm', ring: 'accent' }),
    createElement(Avatar, { name: 'PC', size: 'sm', online: true }),
  );
}

function AvatarGroupDemo(): React.JSX.Element {
  return createElement(
    AvatarGroup,
    { max: 2, 'aria-label': 'Party' },
    createElement(Avatar, { name: 'A', size: 'sm' }),
    createElement(Avatar, { name: 'B', size: 'sm' }),
    createElement(Avatar, { name: 'C', size: 'sm' }),
  );
}

function TableDemo(): React.JSX.Element {
  type Row = { title: string; status: string };
  return createElement(Table<Row>, {
    columns: [
      { key: 'title', label: 'Quest', sortable: true },
      { key: 'status', label: 'Status' },
    ],
    rows: [
      { title: 'Harbor mystery', status: 'Open' },
      { title: 'Salt stair', status: 'Full' },
    ],
    rowKey: (row) => row.title,
  });
}

function ListRowDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'stack' },
    createElement(
      ListRow,
      { variant: 'clickable', onClick: () => undefined },
      createElement('span', { className: 'type-body' }, 'Row one'),
    ),
    createElement(
      ListRow,
      { variant: 'selectable', selected: true },
      createElement('span', { className: 'type-body' }, 'Row two'),
    ),
  );
}

function StatTileDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'row', 'data-wrap': '1' },
    createElement(StatTile, { label: 'Open', value: 12, tone: 'accent' }),
    createElement(StatTile, { label: 'Live', value: 3, tone: 'good' }),
  );
}

function SegmentedDemo(): React.JSX.Element {
  const [seg, setSeg] = useState('a');
  return createElement(SegmentedControl, {
    'aria-label': 'Gallery segments',
    value: seg,
    onValueChange: setSeg,
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ],
  });
}

function ColorSwatchDemo(): React.JSX.Element {
  return createElement(
    'div',
    { className: 'row', 'data-wrap': '1' },
    (
      [
        ['--color-accent', 'Accent'],
        ['--color-warn', 'Warn'],
        ['--color-danger', 'Danger'],
      ] as const
    ).map(([token, label]) =>
      createElement(ColorSwatch, {
        key: token,
        colorVar: token,
        label,
        className: 'gallery-swatch',
      }),
    ),
  );
}

function LegendDemo(): React.JSX.Element {
  return createElement(Legend, {
    'aria-label': 'Status legend',
    items: [
      { id: 'open', label: '● Open' },
      { id: 'full', label: '● Full' },
      { id: 'closed', label: '● Closed' },
    ],
  });
}

function CheckboxDemo(): React.JSX.Element {
  const [checked, setChecked] = useState(true);
  return createElement(
    'div',
    { className: 'stack', 'data-gap': '2' },
    createElement(Checkbox, {
      label: 'Quest signups',
      checked,
      onCheckedChange: setChecked,
    }),
    createElement(Checkbox, { label: 'Unchecked', defaultChecked: false }),
    createElement(Checkbox, {
      label: 'Disabled',
      defaultChecked: true,
      disabled: true,
    }),
  );
}

function StubNoticeDemo(): React.JSX.Element {
  return createElement(StubNotice, {
    title: 'Not available yet',
    message: 'This feature isn’t available yet.',
  });
}

function CalendarDemo(): React.JSX.Element {
  return createElement(Calendar, {
    title: 'October adventures',
    caption: 'A calendar heading with supporting text.',
  });
}

function WeekGridDemo(): React.JSX.Element {
  const days = [
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
    '2026-10-10',
    '2026-10-11',
  ].map((date, i) => ({
    date,
    count: i * 3,
    bucket: Math.min(4, i) as 0 | 1 | 2 | 3 | 4,
  }));
  return createElement(WeekGrid, { days, ariaLabel: 'Gallery week' });
}

function SplitPaneDemo(): React.JSX.Element {
  return createElement(SplitPane, {
    label: 'Gallery split',
    start: createElement('div', { className: 'card' }, 'Left pane'),
    end: createElement('div', { className: 'card' }, 'Right pane'),
  });
}

function MasterDetailDemo(): React.JSX.Element {
  type Item = { id: string; label: string };
  const items: Item[] = [
    { id: 'a', label: 'Item A' },
    { id: 'b', label: 'Item B' },
  ];
  return createElement(MasterDetail<Item>, {
    items,
    itemKey: (item) => item.id,
    selectedKey: 'a',
    renderItem: (item) => item.label,
    renderDetail: (item) => (item ? `Detail: ${item.label}` : 'Detail pane'),
  });
}

function ListboxDemo(): React.JSX.Element {
  const [val, setVal] = useState('a');
  return createElement(Listbox<string>, {
    'aria-label': 'Gallery listbox',
    value: val,
    onValueChange: setVal,
    options: [
      { value: 'a', label: 'Selected option' },
      { value: 'b', label: 'Other option' },
    ],
  });
}

function FieldDateTimeDemo(): React.JSX.Element {
  const [dt, setDt] = useState('2026-10-15T18:00');
  return createElement(
    'div',
    { className: 'stack' },
    createElement(
      FieldDateTime,
      { label: 'When', value: dt, onChange: setDt, ariaLabel: 'Gallery datetime' },
      createElement(DateTimePicker, {
        value: dt,
        onChange: setDt,
        ariaLabel: 'Gallery datetime',
      }),
    ),
    createElement('p', { className: 'type-caption' }, dt || 'No value'),
  );
}

/** Gallery entry registry with meaningful legacy-parity demos. */
export const GALLERY_ENTRIES: readonly GalleryEntry[] = [
  {
    id: 'button',
    title: 'Button',
    section: 'primitives',
    render: () => createElement(ButtonDemo),
  },
  {
    id: 'card',
    title: 'Card',
    section: 'primitives',
    render: () => createElement(CardDemo),
  },
  {
    id: 'chip',
    title: 'Chip',
    section: 'primitives',
    render: () => createElement(ChipDemo),
  },
  {
    id: 'tabs',
    title: 'Tabs',
    section: 'primitives',
    render: () => createElement(TabsDemo),
  },
  {
    id: 'page-header',
    title: 'Page header',
    section: 'primitives',
    layout: 'full',
    render: () => createElement(PageHeaderDemo),
  },
  {
    id: 'filter-bar',
    title: 'Filter bar',
    section: 'primitives',
    layout: 'full',
    render: () => createElement(FilterBarDemo),
  },
  {
    id: 'card-grid',
    title: 'Card grid',
    section: 'primitives',
    layout: 'full',
    render: () => createElement(CardGridDemo),
  },
  {
    id: 'detail-layout',
    title: 'Detail layout',
    section: 'primitives',
    layout: 'full',
    render: () => createElement(DetailLayoutDemo),
  },
  {
    id: 'empty-state',
    title: 'Empty state',
    section: 'primitives',
    render: () => createElement(EmptyDemo),
  },
  {
    id: 'error-state',
    title: 'Error state',
    section: 'primitives',
    render: () => createElement(ErrorDemo),
  },
  {
    id: 'field',
    title: 'Field',
    section: 'primitives',
    render: () => createElement(FieldDemo),
  },
  {
    id: 'modal',
    title: 'Modal',
    section: 'primitives',
    render: () => createElement(ModalDemo),
  },
  {
    id: 'toast',
    title: 'Toast',
    section: 'primitives',
    render: () => createElement(ToastDemo),
  },
  {
    id: 'status-badge',
    title: 'Status badge',
    section: 'primitives',
    render: () => createElement(StatusBadgeDemo),
  },
  {
    id: 'popover',
    title: 'Popover',
    section: 'primitives',
    render: () => createElement(PopoverDemo),
  },
  {
    id: 'menu',
    title: 'Menu',
    section: 'primitives',
    render: () => createElement(MenuDemo),
  },
  {
    id: 'skeleton',
    title: 'Skeleton',
    section: 'primitives',
    render: () => createElement(SkeletonDemo),
  },
  {
    id: 'avatar',
    title: 'Avatar',
    section: 'primitives',
    render: () => createElement(AvatarDemo),
  },
  {
    id: 'avatar-group',
    title: 'Avatar group',
    section: 'primitives',
    render: () => createElement(AvatarGroupDemo),
  },
  {
    id: 'table',
    title: 'Table',
    section: 'primitives',
    render: () => createElement(TableDemo),
  },
  {
    id: 'list-row',
    title: 'List row',
    section: 'primitives',
    render: () => createElement(ListRowDemo),
  },
  {
    id: 'stat-tile',
    title: 'Stat tile',
    section: 'primitives',
    render: () => createElement(StatTileDemo),
  },
  {
    id: 'segmented-control',
    title: 'Segmented control',
    section: 'primitives',
    render: () => createElement(SegmentedDemo),
  },
  {
    id: 'checkbox',
    title: 'Checkbox',
    section: 'primitives',
    render: () => createElement(CheckboxDemo),
  },
  {
    id: 'color-swatch',
    title: 'Color swatch',
    section: 'primitives',
    render: () => createElement(ColorSwatchDemo),
  },
  {
    id: 'legend',
    title: 'Legend',
    section: 'primitives',
    render: () => createElement(LegendDemo),
  },
  {
    id: 'stub-notice',
    title: 'Unavailable state',
    section: 'primitives',
    render: () => createElement(StubNoticeDemo),
  },
  {
    id: 'calendar',
    title: 'Calendar',
    section: 'primitives',
    render: () => createElement(CalendarDemo),
  },
  {
    id: 'week-grid',
    title: 'Week grid',
    section: 'primitives',
    layout: 'full',
    render: () => createElement(WeekGridDemo),
  },
  {
    id: 'split-pane',
    title: 'Split pane',
    section: 'primitives',
    render: () => createElement(SplitPaneDemo),
  },
  {
    id: 'master-detail',
    title: 'Master detail',
    section: 'primitives',
    render: () => createElement(MasterDetailDemo),
  },
  {
    id: 'listbox',
    title: 'Listbox',
    section: 'primitives',
    render: () => createElement(ListboxDemo),
  },
  {
    id: 'field-date-time',
    title: 'Date and time field',
    section: 'primitives',
    render: () => createElement(FieldDateTimeDemo),
  },
  {
    id: 'type-scale',
    title: 'Type scale',
    section: 'identity',
    render: () => createElement(TypeScaleDemo),
  },
  {
    id: 'token-sheet',
    title: 'Token sheet',
    section: 'identity',
    render: () => createElement(TokenSheetDemo),
  },
  {
    id: 'identity-effects',
    title: 'Identity presentation',
    section: 'identity',
    layout: 'full',
    render: () => createElement(Cosmetics),
  },
  {
    id: 'motion',
    title: 'Motion',
    section: 'motion',
    layout: 'full',
    render: () => createElement(Motion),
  },
  {
    id: 'effects',
    title: 'Effects',
    section: 'effects',
    layout: 'full',
    render: () => createElement(Effects),
  },
];

export const GALLERY_SECTIONS = [
  { id: 'primitives', title: 'Primitives' },
  { id: 'identity', title: 'Identity' },
  { id: 'motion', title: 'Motion' },
  { id: 'effects', title: 'Effects' },
] as const;
