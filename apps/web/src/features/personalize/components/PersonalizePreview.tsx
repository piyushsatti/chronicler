import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { useMe } from '../../../hooks/useMe.js';
import { characterStatusLabel, personName, roleLabel } from '../../../utils/format.js';
import styles from './personalizePreview.module.css';

type CharacterPreview = { shortCode: string; name: string; status: string; imageUrl: string | null };

function characterInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

/** Live "how others see you" member card. Theme, mode and density apply as
 * the visitor changes them, so the card doubles as a preview of the look. */
export function PersonalizePreview({ character }: { character?: CharacterPreview }): React.JSX.Element {
  const me = useMe().data;
  const name = personName(me, 'You');
  return (
    <Card
      as="section"
      className={styles.preview}
      aria-label="Preview of your member card"
    >
      <div className={styles.identityPreview}>
        <h2 className="type-heading">How others see you</h2>
        <div className={styles.card}>
          <Avatar name={name} size="lg" ring="accent" />
          <div className={styles.who}>
            <p className="type-title">{name}</p>
            {me && me.roles.length > 0 ? (
              <div className={styles.chips}>
                {me.roles.map((role) => (
                  <Chip key={role} size="sm" tone="line">
                    {roleLabel(role)}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {character ? (
        <Card variant="clickable" to={`/characters/${character.shortCode}`} className={styles.character}>
          <Avatar name={characterInitials(character.name)} src={character.imageUrl ?? undefined} size="md" />
          <div className={styles.who}>
            <p className="type-title">{character.name}</p>
            <p className="type-label">{characterStatusLabel(character.status)}</p>
          </div>
        </Card>
      ) : null}
      <p className="type-body">
        Quests, chronicles and codex entries look like this to you.
      </p>
      <section className={styles.samples} aria-label="Button style samples">
        <h3 className="type-label">Button styles</h3>
        <span className="btn btn--primary btn--sm primary sm">Sign up</span>
        <span className="btn btn--secondary btn--sm sm">Details</span>
        <Chip size="sm" tone="line">
          Sample tag
        </Chip>
      </section>
      <p className="type-caption">
        Your name and handle come from Discord. Theme choices only change what you see.
      </p>
    </Card>
  );
}
