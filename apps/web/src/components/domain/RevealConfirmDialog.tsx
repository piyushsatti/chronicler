import { type ReactNode } from 'react';
import { Modal } from '../primitives/Modal.js';
import { Button } from '../primitives/Button.js';
import { Card } from '../primitives/Card.js';

export interface RevealConfirmDialogProps {
  isOpen: boolean;
  title: string;
  preview: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  description?: ReactNode;
  confirmDisabled?: boolean;
  pending?: boolean;
}

export function RevealConfirmDialog({
  isOpen,
  title,
  preview,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  description,
  confirmDisabled,
  pending = false,
}: RevealConfirmDialogProps) {
  return (
    <Modal
      open={isOpen}
      onClose={() => {
        if (!pending) onClose();
      }}
      title={title}
    >
      {description ? <p className="type-body">{description}</p> : null}
      <Card pad={4} tone={2} data-testid="reveal-confirm-preview">
        {preview}
      </Card>
      <div className="row" data-gap="2" data-justify="end">
        <Button size="sm" type="button" onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled || pending}
          pending={pending}
        >
          {pending ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
