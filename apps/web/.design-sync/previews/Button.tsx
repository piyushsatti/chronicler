import { Button } from '@pi/chronicler-ds';

export function Variants() {
  return (
    <div className="row" data-gap="3" data-wrap="1">
      <Button variant="primary">Join quest</Button>
      <Button variant="secondary">View roster</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="danger">Retire character</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="row" data-gap="3" data-align="center">
      <Button size="sm">Add note</Button>
      <Button size="md">Schedule session</Button>
      <Button size="lg">Publish chronicle</Button>
    </div>
  );
}

export function States() {
  return (
    <div className="row" data-gap="3" data-wrap="1">
      <Button pending>Saving…</Button>
      <Button disabled>Quest full</Button>
      <Button variant="secondary" disabled>
        Signups closed
      </Button>
    </div>
  );
}
