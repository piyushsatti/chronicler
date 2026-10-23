import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import type { CharacterViewModel } from '../adapters/characterAdapter.js';
import { isCharacterImageUrl } from '../imageUrl.js';
import { characterStatusLabel } from '../../../utils/format.js';
import styles from '../pages/characterDetail.module.css';

/** Roster card: small portrait (initials when absent or broken), status, name, class. */
export function CharacterCard({
  character,
  showStatus = true,
}: {
  character: CharacterViewModel;
  showStatus?: boolean;
}): React.JSX.Element {
  const initials = character.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('');
  const src =
    character.imageUrl && isCharacterImageUrl(character.imageUrl)
      ? character.imageUrl
      : undefined;
  return (
    <Card variant="clickable" to={`/characters/${character.shortCode}`} pad={4}>
      <div className={styles.cardRow}>
        {/* Decorative: the card heading already names the character. */}
        <span aria-hidden className={styles.cardAvatar}>
          <Avatar name={initials || '?'} src={src} size="md" />
        </span>
        <div className={styles.cardBody}>
          {/* On the Approved-only list every card would repeat the same word; exceptions still show. */}
          {showStatus || character.status.toLowerCase() !== 'active' ? (
            <p className="type-label">{characterStatusLabel(character.status)}</p>
          ) : null}
          <h2 className="type-title">{character.name}</h2>
          <p className="type-caption">
            {character.ddbMirror?.classes ?? 'Character'}
            {character.ddbMirror?.species ? ` · ${character.ddbMirror.species}` : ''}
          </p>
        </div>
      </div>
    </Card>
  );
}
