import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';

export function WelcomePage(): React.JSX.Element {
  return (
    <SingleRegionPage page="welcome">
      <p className="eyebrow">Welcome</p>
      <h1 className="type-display">Find your place at the table</h1>
      <p className="type-body">
        Chronicler keeps quests, characters, and the codex in one war room. Sign in with Discord to
        claim your seat.
      </p>
      <div className="stack-row">
        <Link className="btn btn--primary" to="/login">
          Continue with Discord
        </Link>
        <Link className="type-link" to="/">
          Browse as guest
        </Link>
      </div>
    </SingleRegionPage>
  );
}
