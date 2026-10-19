import { Avatar } from '../primitives/Avatar.js';

export interface AtlasDmChipProps {
  name: string;
  fam?: string | null;
  onClick?: () => void;
}

export function AtlasDmChip({ name, fam, onClick }: AtlasDmChipProps) {
  return (
    <button className="dm" onClick={onClick} type="button">
      <Avatar name={name} online />
      {name}
      {fam ? <span className="fam">· {fam}</span> : null}
    </button>
  );
}
