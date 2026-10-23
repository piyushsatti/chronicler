import { Avatar } from '../../../components/primitives/Avatar.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { useMe } from '../../../hooks/useMe.js';
import { handleLabel, personName, roleLabel } from '../../../utils/format.js';
import styles from './personalizePreview.module.css';

/** Live "how others see you" member card. Theme, mode and density apply as
 * the visitor changes them, so the card doubles as a preview of the look. */
export function PersonalizePreview(): React.JSX.Element {
  const me = useMe().data;
  const name = personName(me, 'You');
  const handle = handleLabel(me?.handle);
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
            {handle ? <p className="type-caption">{handle}</p> : null}
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
      <p className="type-body">
        Quests, chronicles and codex entries look like this to you.
      </p>
      <div className={styles.samples} aria-hidden="true">
        <Button size="sm" tabIndex={-1}>
          Sign up
        </Button>
        <Button size="sm" variant="secondary" tabIndex={-1}>
          Details
        </Button>
        <Chip size="sm" tone="line">
          Sample tag
        </Chip>
      </div>
      <p className="type-caption">
        Your name and handle come from Discord. Theme choices only change what you see.
      </p>
    </Card>
  );
}
