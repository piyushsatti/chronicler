// A6 registry: the primitives ruled by Epic B (26) plus Menu (27)
// (notes/design/epic-drafts/epic-B-primitives-gallery-effects.md, owner ruling
// 2026-08-02). Epic B is mid-flight: `status` is the source of truth for
// which rows have shipped a module plus a gallery entry; 'pending' rows have
// neither. This file exists so the A6 duplication/orphan gates below have a
// machine-readable source of truth to diff the `components/primitives/**`
// tree against, instead of each gate re-deriving "what counts as a
// primitive" from prose.
//
// `galleryEntryId` is a real kebab-case slug of `name` as of B6 (#466): the
// gallery/workbench route reads it, and check-gallery.mjs cross-checks it
// against app/pages/gallery/entries/index.ts. `module` is the app-relative
// path (no extension) a primitive will live at; `status` is 'pending' until
// a builder ships both the module and its gallery entry.
//
// Numbering follows the owner's explicit call-outs (WeekGrid = primitive 19,
// AvatarGroup = primitive 23); everything else is filled in document order
// from the epic draft. Renumbering only on a new owner ruling.
//
// B12 (#491) note: design-language.md calls `Legend` "primitive 22" — that
// headline is the pre-AvatarGroup numbering epoch (doc headline "now 22"),
// superseded by the later AvatarGroup ruling (doc headline "now 23"). No new
// owner ruling renumbered the registry; `Legend` is appended after the B11
// pair (Calendar=24, FieldDateTime=25) as id 26, ids 1-25 untouched.

export type PrimitiveGroup = 'B1' | 'B2' | 'B3' | 'B4' | 'B4b' | 'B5' | 'B11' | 'B12';

export interface PrimitiveRegistryEntry {
  id: number;
  name: string;
  group: PrimitiveGroup;
  galleryEntryId: string;
  module: string;
  status: 'pending' | 'built';
}

export const PRIMITIVES_REGISTRY: PrimitiveRegistryEntry[] = [
  { id: 1, name: 'Card', group: 'B1', galleryEntryId: 'card', module: 'components/primitives/Card', status: 'built' },
  { id: 2, name: 'ListRow', group: 'B1', galleryEntryId: 'list-row', module: 'components/primitives/ListRow', status: 'built' },
  { id: 3, name: 'StatTile', group: 'B1', galleryEntryId: 'stat-tile', module: 'components/primitives/StatTile', status: 'built' },
  { id: 4, name: 'ColorSwatch', group: 'B1', galleryEntryId: 'color-swatch', module: 'components/primitives/ColorSwatch', status: 'built' },
  { id: 5, name: 'StubNotice', group: 'B1', galleryEntryId: 'stub-notice', module: 'components/foundation/StubNotice', status: 'built' },
  { id: 6, name: 'Button', group: 'B2', galleryEntryId: 'button', module: 'components/primitives/Button', status: 'built' },
  { id: 7, name: 'Chip', group: 'B2', galleryEntryId: 'chip', module: 'components/primitives/Chip', status: 'built' },
  { id: 8, name: 'Field', group: 'B2', galleryEntryId: 'field', module: 'components/foundation/Field', status: 'built' },
  { id: 9, name: 'Popover', group: 'B2', galleryEntryId: 'popover', module: 'components/primitives/Popover', status: 'built' },
  { id: 10, name: 'Listbox', group: 'B2', galleryEntryId: 'listbox', module: 'components/primitives/Listbox', status: 'built' },
  { id: 11, name: 'Tabs', group: 'B3', galleryEntryId: 'tabs', module: 'components/primitives/Tabs', status: 'built' },
  { id: 12, name: 'SegmentedControl', group: 'B3', galleryEntryId: 'segmented-control', module: 'components/primitives/SegmentedControl', status: 'built' },
  { id: 13, name: 'Table', group: 'B3', galleryEntryId: 'table', module: 'components/primitives/Table', status: 'built' },
  { id: 14, name: 'SplitPane', group: 'B3', galleryEntryId: 'split-pane', module: 'components/primitives/SplitPane', status: 'built' },
  { id: 15, name: 'MasterDetail', group: 'B3', galleryEntryId: 'master-detail', module: 'components/primitives/MasterDetail', status: 'built' },
  { id: 16, name: 'Modal', group: 'B4', galleryEntryId: 'modal', module: 'components/primitives/Modal', status: 'built' },
  { id: 17, name: 'Toast', group: 'B4', galleryEntryId: 'toast', module: 'components/primitives/Toast', status: 'built' },
  { id: 18, name: 'Avatar', group: 'B4', galleryEntryId: 'avatar', module: 'components/primitives/Avatar', status: 'built' },
  { id: 19, name: 'WeekGrid', group: 'B3', galleryEntryId: 'week-grid', module: 'components/primitives/WeekGrid', status: 'built' },
  { id: 20, name: 'Skeleton', group: 'B5', galleryEntryId: 'skeleton', module: 'components/primitives/Skeleton', status: 'built' },
  { id: 21, name: 'EmptyState', group: 'B5', galleryEntryId: 'empty-state', module: 'components/primitives/EmptyState', status: 'built' },
  { id: 22, name: 'ErrorState', group: 'B5', galleryEntryId: 'error-state', module: 'components/primitives/ErrorState', status: 'built' },
  { id: 23, name: 'AvatarGroup', group: 'B4b', galleryEntryId: 'avatar-group', module: 'components/primitives/AvatarGroup', status: 'built' },
  { id: 24, name: 'Calendar', group: 'B11', galleryEntryId: 'calendar', module: 'components/primitives/Calendar', status: 'built' },
  { id: 25, name: 'FieldDateTime', group: 'B11', galleryEntryId: 'field-date-time', module: 'components/primitives/FieldDateTime', status: 'built' },
  { id: 26, name: 'Legend', group: 'B12', galleryEntryId: 'legend', module: 'components/primitives/Legend', status: 'built' },
  { id: 27, name: 'Menu', group: 'B2', galleryEntryId: 'menu', module: 'components/primitives/Menu', status: 'built' },
  { id: 28, name: 'Checkbox', group: 'B2', galleryEntryId: 'checkbox', module: 'components/primitives/Checkbox', status: 'built' },
  { id: 29, name: 'PageHeader', group: 'B3', galleryEntryId: 'page-header', module: 'components/primitives/PageHeader', status: 'built' },
  { id: 30, name: 'FilterBar', group: 'B3', galleryEntryId: 'filter-bar', module: 'components/primitives/FilterBar', status: 'built' },
  { id: 31, name: 'CardGrid', group: 'B3', galleryEntryId: 'card-grid', module: 'components/primitives/CardGrid', status: 'built' },
  { id: 32, name: 'DetailLayout', group: 'B3', galleryEntryId: 'detail-layout', module: 'components/primitives/DetailLayout', status: 'built' },
];

// registry ids are insertion order, not doc numbering: 24 Calendar = doc primitive 20,
// 25 FieldDateTime = doc primitive 21 (one-pair counting); 26 Legend; 27 Menu
// (Base UI menu-button, split from Popover's former `variant: 'menu'`); 28 Checkbox
// (Base UI Checkbox, replaces native checkboxes); 29-31 PageHeader, FilterBar,
// CardGrid (round 3 layout anatomy: one header, one filter surface, one card
// grid per index page) appended last; 32 DetailLayout (round 3 L7: detail
// pages, main column plus optional --rail-width rail via SplitPane).

if (PRIMITIVES_REGISTRY.length !== 32) {
  throw new Error(`primitives.registry.ts: expected 32 ruled primitives, found ${PRIMITIVES_REGISTRY.length}`);
}
