import { Button, Modal } from '@pi/chronicler-ds';

const noop = () => undefined;

export function WithdrawConfirmation() {
  return (
    <div style={{ height: 480 }}>
    <Modal open title="Withdraw character" onClose={noop}>
      <div className="stack" data-gap="4">
        <p className="type-body">
          Withdraw Kael Storm from “The Drowned Bell of Dunnshore”? The DM will be notified and
          your seat returns to the waitlist.
        </p>
        <div className="row" data-gap="2">
          <Button variant="danger">Withdraw</Button>
          <Button variant="ghost">Keep my seat</Button>
        </div>
      </div>
    </Modal>
    </div>
  );
}

export function UnsavedChanges() {
  return (
    <div style={{ height: 480 }}>
    <Modal open title="Leave with unsaved changes?" onClose={noop}>
      <div className="stack" data-gap="4">
        <p className="type-body">
          Your recovery copy of the Session 14 chronicle stays in this browser for this account
          and revision.
        </p>
        <div className="row" data-gap="2">
          <Button>Keep editing</Button>
          <Button variant="secondary">Leave page</Button>
        </div>
      </div>
    </Modal>
    </div>
  );
}
