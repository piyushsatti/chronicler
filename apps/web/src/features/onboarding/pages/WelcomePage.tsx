import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { Card } from '../../../components/primitives/Card.js';
import styles from './welcome.module.css';

const PLACES = [
  {
    to: '/quests',
    title: 'Quests',
    body: 'See which tables are recruiting and claim a seat at the next session.',
  },
  {
    to: '/chronicles',
    title: 'Chronicles',
    body: 'Read what happened at past sessions, told by the players who were there.',
  },
  {
    to: '/codex',
    title: 'Codex',
    body: 'Look up the people, places and lore of the shared world.',
  },
] as const;

export function WelcomePage(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  return (
    <PageShell
      title={isAuthenticated ? 'Welcome back' : 'Find your place at the table'}
    >
      <SingleRegionPage page="welcome">
        <div className="stack" data-gap="5">
          <p className="type-narrative">
            {isAuthenticated
              ? 'Pick up a quest, check on your characters, or catch up on what the other tables have been doing.'
              : 'Chronicler keeps the server’s quests, characters and codex in one place. Sign in with your Discord account to sign up for sessions and keep your characters.'}
          </p>
          <div className="row" data-wrap="1" data-gap="3">
            {isAuthenticated ? (
              <>
                <Link className="btn btn--primary" to="/quests">
                  Find a quest
                </Link>
                <Link className="btn btn--secondary" to="/characters">
                  Your characters
                </Link>
              </>
            ) : (
              <>
                <Link className="btn btn--primary" to="/login">
                  Continue with Discord
                </Link>
                <Link className="btn btn--secondary" to="/">
                  Browse as guest
                </Link>
              </>
            )}
          </div>
          <section className="stack" aria-labelledby="welcome-places" data-gap="3">
            <h2 className="type-heading" id="welcome-places">
              What’s here
            </h2>
            <ul className={styles.places} role="list">
              {PLACES.map((place) => (
                <li key={place.to}>
                  <Card
                    variant="clickable"
                    to={place.to}
                    className="stack"
                    data-gap="2"
                  >
                    <h3 className="type-title">{place.title}</h3>
                    <p className="type-body">{place.body}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
