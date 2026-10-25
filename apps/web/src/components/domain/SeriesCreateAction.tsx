import { useState } from 'react';
import { Field } from '../foundation/Field.js';
import { StatePanel } from '../foundation/StatePanel.js';
import { Button, type ButtonProps } from '../primitives/Button.js';
import { Modal } from '../primitives/Modal.js';
import { seriesNameError, useSeriesPage } from '../../hooks/useSeriesPage.js';

type SeriesCreateActionProps = {
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  /** False inside a row of other actions, where an error panel would break the row. */
  showAuthorityError?: boolean;
};

/** The one way to start a series: a button that opens the create dialog.
 * Renders nothing unless the viewer is an approved DM. */
export function SeriesCreateAction({
  label = 'New series',
  variant = 'secondary',
  size = 'md',
  showAuthorityError = true,
}: SeriesCreateActionProps = {}): React.JSX.Element | null {
  const page = useSeriesPage('');
  const [open, setOpen] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  if (page.checkingAuthority)
    return (
      <Button variant={variant} size={size} disabled>
        Checking your DM status…
      </Button>
    );
  if (!page.canCreate)
    return showAuthorityError && page.authorityError ? (
      <StatePanel
        status="error"
        error={page.authorityError}
        onRetry={page.retryAuthority}
      />
    ) : null;
  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          setNameError(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Modal
        open={open}
        title="Create a quest series"
        onClose={() => setOpen(false)}
        size="sm"
      >
        <form
          className="stack"
          data-gap="4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get('name') ?? '');
            const invalid = seriesNameError(name);
            setNameError(invalid);
            if (!invalid) void page.save(null, name, () => setOpen(false));
          }}
        >
          <Field
            label="New series name"
            name="name"
            required
            error={nameError ?? undefined}
            onChange={() => setNameError(null)}
          />
          {page.error ? <StatePanel status="error" error={page.error} /> : null}
          <div className="row" data-gap="3" data-wrap="1">
            <Button type="submit" pending={page.pending}>
              Create series
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
