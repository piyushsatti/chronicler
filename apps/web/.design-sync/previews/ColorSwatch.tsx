import { ColorSwatch } from '@pi/chronicler-ds';

export function Semantic() {
  return (
    <div className="row" data-gap="4" data-wrap="1">
      <ColorSwatch colorVar="--color-accent" label="Accent" />
      <ColorSwatch colorVar="--color-good" label="Good" />
      <ColorSwatch colorVar="--color-warn" label="Warn" />
      <ColorSwatch colorVar="--color-danger" label="Danger" />
    </div>
  );
}

export function CharacterStatus() {
  return (
    <div className="row" data-gap="4" data-wrap="1">
      <ColorSwatch colorVar="--color-status-alive" label="Alive" />
      <ColorSwatch colorVar="--color-status-missing" label="Missing" />
      <ColorSwatch colorVar="--color-status-retired" label="Retired" />
      <ColorSwatch colorVar="--color-status-dead" label="Dead" />
    </div>
  );
}

export function Regions() {
  return (
    <div className="row" data-gap="4" data-wrap="1">
      <ColorSwatch colorVar="--color-region-dalmond" label="Dalmond" />
      <ColorSwatch colorVar="--color-region-dunnshore" label="Dunnshore" />
      <ColorSwatch colorVar="--color-region-esparithen" label="Esparithen" />
      <ColorSwatch colorVar="--color-region-hollow-highlands" label="Hollow Highlands" />
      <ColorSwatch colorVar="--color-region-pawluck" label="Pawluck" />
      <ColorSwatch colorVar="--color-region-pelsand" label="Pelsand" />
      <ColorSwatch colorVar="--color-region-viceroc" label="Viceroc" />
    </div>
  );
}
