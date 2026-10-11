import type { ReactNode } from 'react';
import { createElement, useState } from 'react';
import { Field } from '../../../components/foundation/Field.js';
import {
  StatusBadge,
} from '../../../components/foundation/StatusBadge.js';
import { StubNotice } from '../../../components/foundation/StubNotice.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { AvatarGroup } from '../../../components/primitives/AvatarGroup.js';
import { Button } from '../../../components/primitives/Button.js';
import { Calendar } from '../../../components/primitives/Calendar.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { ColorSwatch } from '../../../components/primitives/ColorSwatch.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { ErrorState } from '../../../components/primitives/ErrorState.js';
import { FieldDateTime } from '../../../components/primitives/FieldDateTime.js';
import { Legend } from '../../../components/primitives/Legend.js';
import { Listbox } from '../../../components/primitives/Listbox.js';
import { ListRow } from '../../../components/primitives/ListRow.js';
import { MasterDetail } from '../../../components/primitives/MasterDetail.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { Popover } from '../../../components/primitives/Popover.js';
import { SegmentedControl } from '../../../components/primitives/SegmentedControl.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { SplitPane } from '../../../components/primitives/SplitPane.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { Table } from '../../../components/primitives/Table.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { Toast, useToast } from '../../../components/primitives/Toast.js';
import { WeekGrid } from '../../../components/primitives/WeekGrid.js';
import { DateTimePicker } from '../../../components/interactive/DateTimePicker.js';
import { useAppSelector } from '../../../store/hooks.js';

export type GalleryEntry = {
  id: string;
  title: string;
  section: 'primitives' | 'identity' | 'motion' | 'effects';
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
      'Default card used for interactive containers and gallery smoke.',
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

function EmptyDemo(): React.JSX.Element {
  return createElement(EmptyState, {
    kind: 'no-quests',
    message: 'Gallery empty-state demo.',
  });
}

function ErrorDemo(): React.JSX.Element {
  return createElement(ErrorState, {
    title: 'Gallery error demo',
    message: 'Retry control is wired for contract smoke.',
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

function MotionDemo(): React.JSX.Element {
  return createElement(
    'p',
    { className: 'type-body', 'data-motion': 'fade-in' },
    'Motion token surface — fade-in presence cue.',
  );
}

function EffectsDemo(): React.JSX.Element {
  return createElement(
    'p',
    { className: 'type-body', 'data-effect': 'ambient' },
    'Effects surface — ambient layer hook for gallery QA.',
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
    createElement(
      Toast,
      { tone: 'info' },
      'Static Toast chip (presentational)',
    ),
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
  type Row = { code: string; title: string };
  return createElement(Table<Row>, {
    columns: [
      { key: 'code', label: 'Code', sortable: true },
      { key: 'title', label: 'Title' },
    ],
    rows: [
      { code: 'Q-101', title: 'Harbor mystery' },
      { code: 'Q-102', title: 'Salt stair' },
    ],
    rowKey: (row) => row.code,
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

function StubNoticeDemo(): React.JSX.Element {
  return createElement(StubNotice, {
    title: 'Stub',
    message: 'Capability stub — not wired yet.',
  });
}

function CalendarDemo(): React.JSX.Element {
  return createElement(Calendar, {
    title: 'Calendar surface',
    caption: 'Month grid placeholder for gallery QA.',
  });
}

function WeekGridDemo(): React.JSX.Element {
  const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map(
    (date, i) => ({ date, count: i * 3, bucket: Math.min(4, i) as 0 | 1 | 2 | 3 | 4 }),
  );
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
  { id: 'button', title: 'Button', section: 'primitives', render: () => createElement(ButtonDemo) },
  { id: 'card', title: 'Card', section: 'primitives', render: () => createElement(CardDemo) },
  { id: 'chip', title: 'Chip', section: 'primitives', render: () => createElement(ChipDemo) },
  { id: 'tabs', title: 'Tabs', section: 'primitives', render: () => createElement(TabsDemo) },
  {
    id: 'empty-state',
    title: 'EmptyState',
    section: 'primitives',
    render: () => createElement(EmptyDemo),
  },
  {
    id: 'error-state',
    title: 'ErrorState',
    section: 'primitives',
    render: () => createElement(ErrorDemo),
  },
  { id: 'field', title: 'Field', section: 'primitives', render: () => createElement(FieldDemo) },
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
    title: 'StatusBadge',
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
    id: 'skeleton',
    title: 'Skeleton',
    section: 'primitives',
    render: () => createElement(SkeletonDemo),
  },
  { id: 'avatar', title: 'Avatar', section: 'primitives', render: () => createElement(AvatarDemo) },
  {
    id: 'avatar-group',
    title: 'AvatarGroup',
    section: 'primitives',
    render: () => createElement(AvatarGroupDemo),
  },
  { id: 'table', title: 'Table', section: 'primitives', render: () => createElement(TableDemo) },
  {
    id: 'list-row',
    title: 'ListRow',
    section: 'primitives',
    render: () => createElement(ListRowDemo),
  },
  {
    id: 'stat-tile',
    title: 'StatTile',
    section: 'primitives',
    render: () => createElement(StatTileDemo),
  },
  {
    id: 'segmented-control',
    title: 'SegmentedControl',
    section: 'primitives',
    render: () => createElement(SegmentedDemo),
  },
  {
    id: 'color-swatch',
    title: 'ColorSwatch',
    section: 'primitives',
    render: () => createElement(ColorSwatchDemo),
  },
  { id: 'legend', title: 'Legend', section: 'primitives', render: () => createElement(LegendDemo) },
  {
    id: 'stub-notice',
    title: 'StubNotice',
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
    title: 'WeekGrid',
    section: 'primitives',
    render: () => createElement(WeekGridDemo),
  },
  {
    id: 'split-pane',
    title: 'SplitPane',
    section: 'primitives',
    render: () => createElement(SplitPaneDemo),
  },
  {
    id: 'master-detail',
    title: 'MasterDetail',
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
    title: 'FieldDateTime',
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
  { id: 'motion', title: 'Motion', section: 'motion', render: () => createElement(MotionDemo) },
  {
    id: 'effects',
    title: 'Effects',
    section: 'effects',
    render: () => createElement(EffectsDemo),
  },
];

export const GALLERY_SECTIONS = [
  { id: 'primitives', title: 'Primitives' },
  { id: 'identity', title: 'Identity' },
  { id: 'motion', title: 'Motion' },
  { id: 'effects', title: 'Effects' },
] as const;
