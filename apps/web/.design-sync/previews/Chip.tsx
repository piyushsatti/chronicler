import { Chip } from '@pi/chronicler-ds';

export function Tones() {
  return (
    <Chip.Row>
      <Chip tone="neutral">Homebrew</Chip>
      <Chip tone="line">One-shot</Chip>
      <Chip tone="accent">Featured</Chip>
      <Chip tone="status">Open</Chip>
      <Chip tone="category">Dungeon crawl</Chip>
    </Chip.Row>
  );
}

export function Sizes() {
  return (
    <div className="stack" data-gap="3">
      <Chip.Row>
        <Chip size="sm">Level 3–5</Chip>
        <Chip size="sm" tone="line">4 seats</Chip>
        <Chip size="sm" tone="status">2 alerts</Chip>
      </Chip.Row>
      <Chip.Row>
        <Chip size="md">Level 3–5</Chip>
        <Chip size="md" tone="line">4 seats</Chip>
        <Chip size="md" tone="status">2 alerts</Chip>
      </Chip.Row>
    </div>
  );
}

export function FilterRow() {
  return (
    <Chip.Row>
      <Chip tone="accent" selected onClick={() => {}}>
        All quests
      </Chip>
      <Chip tone="accent" onClick={() => {}}>
        Hollow Highlands
      </Chip>
      <Chip tone="accent" onClick={() => {}}>
        Pelsand
      </Chip>
      <Chip tone="accent" onClick={() => {}}>
        Viceroc
      </Chip>
    </Chip.Row>
  );
}

export function WithDot() {
  return (
    <Chip.Row>
      <Chip dot tone="status">Live session</Chip>
      <Chip dot tone="category">Roleplay</Chip>
      <Chip dot tone="line">Downtime</Chip>
    </Chip.Row>
  );
}
