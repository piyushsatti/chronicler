# Chronicler design system — how to build with it

Chronicler is a tabletop campaign-management app (quests, sessions, chronicles, characters, DMs). Write content in that world.

## Setup

Wrap every design in `DsRoot`. It sets `data-theme` / `data-mode` / `data-density` on `<html>` (all tokens hang off these), paints the page surface (`--color-bg-deep` background, `--color-text`, body font) and provides router context (`Card` with `to` renders a router link). Without it, text is light-on-white and unreadable.

```jsx
const { DsRoot, Card, Button, Chip } = window.Chronicler;
<DsRoot theme="parchment" mode="dark">{/* design */}</DsRoot>
```

Themes: `parchment` (default), `midnight`, `ember`, `dracula`, `vegan`; modes `dark` | `light`; density `comfortable` | `compact`.

## Styling idiom

Use the components for controls and surfaces. For your own layout glue use the global layout and type classes — never raw hex, px font sizes or ad-hoc shadows.

| Need | Use |
| --- | --- |
| Vertical / horizontal flow | `className="stack"` / `className="row"` + `data-gap="1".."8"` (4/8/12/16/24/32/48/64 px), `data-align="center"`, `data-wrap="1"` |
| Text | `type-display`, `type-heading`, `type-title`, `type-body`, `type-narrative` (serif prose), `type-caption`, `type-label` (small caps), `type-value` (numbers), `type-code` |
| Colour | `var(--color-text)`, `var(--color-text-muted)`, `var(--color-accent)`, `var(--color-border)`, `var(--color-bg-panel)`, `var(--color-bg-surface)` |
| Space / radius / elevation | `var(--sp-1)`..`var(--sp-8)`, `var(--rad)`, `var(--rad-sm)`, `var(--rad-pill)`, `var(--shadow-1)`..`var(--shadow-3)` |

Fonts: Geist (UI), Fraunces (display/headings/narrative), Geist Mono (code). One accent: bronze `--color-accent`. Status colour comes from `StatusBadge`, `Chip tone`, `StatTile tone`, not from your own colours.

## Where the truth lives

Read `styles.css` and its imports (tokens, layout, typography, primitives) before styling, and each component's `<Name>.prompt.md` / `<Name>.d.ts` for its API.

## Patterns

- Surfaces: `Card` (`tone` 1/2/3/flat, `pad`, `variant="clickable"` + `to`/`href`/`onClick`); slots `Card.Eyebrow`, `Card.Header` (flex row: title + trailing chip), `Card.Body`, `Card.Footer`. Put `Card.Eyebrow` outside `Card.Header`.
- Async states: `StatePanel status="loading|empty|error"`, `EmptyState`, `ErrorState`, `Skeleton` — always design all three.
- Selection: `SegmentedControl` for 2-4 filters, `Tabs` for sections, `Listbox` for lists, `Chip.Row` of `Chip selected` for multi-filters.
- Forms: `Field label error` wrapping an `input`/`select`/`textarea` with `className="field-input"`.

```jsx
<Card pad={5} className="stack" data-gap="3">
  <Card.Eyebrow>Q-0147 · Levels 3–5</Card.Eyebrow>
  <Card.Header>
    <h3 className="type-heading" style={{ flex: 1 }}>The Drowned Bell of Saltmere</h3>
    <Chip tone="status">Open</Chip>
  </Card.Header>
  <p className="type-body">Fishermen swear a bell tolls beneath the harbour at low tide.</p>
  <div className="row" data-gap="2"><Button>Join quest</Button><Button variant="ghost">Details</Button></div>
</Card>
```
