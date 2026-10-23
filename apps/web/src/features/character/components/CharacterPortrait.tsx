import { useState } from 'react';
import { isCharacterImageUrl } from '../../../utils/characterImageUrl.js';
import styles from '../pages/characterDetail.module.css';

/**
 * Page-header portrait (D5). Shows the owner's https image in a fixed square, and
 * falls back to the initials token when there is no image or it fails to load.
 */
export function CharacterPortrait({
  name,
  imageUrl,
  initials,
}: {
  name: string;
  imageUrl: string | null;
  initials: string;
}): React.JSX.Element {
  const [failed, setFailed] = useState<string | null>(null);
  if (imageUrl && isCharacterImageUrl(imageUrl) && failed !== imageUrl) {
    return (
      <img
        className={`${styles.token} ${styles.portrait}`}
        src={imageUrl}
        alt={`Portrait of ${name}`}
        width={96}
        height={96}
        referrerPolicy="no-referrer"
        data-el="character.portrait"
        onError={() => setFailed(imageUrl)}
      />
    );
  }
  return (
    <div className={styles.token} aria-hidden data-el="character.token">
      {initials}
    </div>
  );
}
