export type HexExplorationState = 'locked' | 'unlocked' | 'mapped';

export type HexCellView = {
  hexcode: string;
  state: HexExplorationState;
};

export function MapHexPanel({
  hexes,
  selectedHexcode,
  onSelect,
}: {
  hexes: HexCellView[];
  selectedHexcode: string | null;
  onSelect: (hexcode: string) => void;
}): React.JSX.Element {
  return (
    <div className="hex-grid" role="list" aria-label="Map hexes">
      {hexes.map((hex) => {
        const locked = hex.state === 'locked';
        return (
          <button
            key={hex.hexcode}
            type="button"
            role="listitem"
            className="hex-cell"
            data-state={hex.state}
            data-selected={selectedHexcode === hex.hexcode ? 'true' : 'false'}
            disabled={locked}
            aria-label={`${hex.hexcode}, ${hex.state}`}
            onClick={() => {
              if (!locked) onSelect(hex.hexcode);
            }}
          >
            <span className="type-title">{hex.hexcode}</span>
            <span className="type-caption">{hex.state}</span>
          </button>
        );
      })}
    </div>
  );
}
