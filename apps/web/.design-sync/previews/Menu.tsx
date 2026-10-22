import { Menu, RegionLabel } from '@pi/chronicler-ds';

const noop = () => undefined;

export function AddRegion() {
  return (
    <Menu
      open
      onOpenChange={noop}
      ariaLabel="Add region"
      trigger={<span>+ Add region…</span>}
      items={['Dunnshore', 'Hollow Highlands', 'Esparithen', 'Viceroc'].map((region) => ({
        key: region,
        label: <RegionLabel region={region} />,
        textValue: region,
        onSelect: noop,
      }))}
    />
  );
}

export function QuestActions() {
  return (
    <Menu
      open
      onOpenChange={noop}
      ariaLabel="Quest actions"
      trigger={<span className="btn btn--secondary">Quest actions</span>}
      items={[
        { key: 'edit', label: 'Edit quest details', onSelect: noop },
        { key: 'duplicate', label: 'Duplicate as draft', onSelect: noop },
        { key: 'archive', label: 'Archive quest', onSelect: noop, disabled: true },
      ]}
    />
  );
}

export function NoOptionsLeft() {
  return (
    <Menu
      open
      onOpenChange={noop}
      ariaLabel="Add region"
      trigger={<span>+ Add region…</span>}
      items={[]}
      emptyLabel={<p className="type-caption">No more regions</p>}
    />
  );
}
