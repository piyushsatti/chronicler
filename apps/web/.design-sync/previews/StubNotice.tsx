import { StubNotice } from '@pi/chronicler-ds';

export function Default() {
  return <StubNotice />;
}

export function WithTitle() {
  return <StubNotice title="Faction standings" message="Sample reputation data — ledger sync pending" />;
}

export function WithDetails() {
  return (
    <StubNotice title="Downtime activities" message="Capability stub — not wired yet">
      <p className="type-caption">Crafting and carousing logs arrive with the next season.</p>
    </StubNotice>
  );
}
