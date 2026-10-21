import { RegionLabel } from '@pi/chronicler-ds';

export function Regions() {
  return (
    <div className="row" data-gap="2" data-wrap="1">
      <RegionLabel region="Dunnshore" />
      <RegionLabel region="Hollow Highlands" />
      <RegionLabel region="Esparithen" />
      <RegionLabel region="Pawluck" />
      <RegionLabel region="Pelsand" />
      <RegionLabel region="Viceroc" />
      <RegionLabel region="Dalmond" />
    </div>
  );
}

export function Selected() {
  return (
    <div className="row" data-gap="2" data-wrap="1">
      <RegionLabel region="Dunnshore" selected />
      <RegionLabel region="Hollow Highlands" />
      <RegionLabel region="Viceroc" selected />
    </div>
  );
}

export function Compact() {
  return (
    <div className="row" data-gap="2" data-wrap="1">
      <RegionLabel region="Pawluck" compact />
      <RegionLabel region="Pelsand" compact />
      <RegionLabel region="Unmapped Reaches" compact />
    </div>
  );
}
