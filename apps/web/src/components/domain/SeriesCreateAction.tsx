import { useState } from 'react';
import { Field } from '../foundation/Field.js';
import { StatePanel } from '../foundation/StatePanel.js';
import { Button } from '../primitives/Button.js';
import { Modal } from '../primitives/Modal.js';
import { useSeriesPage } from '../../hooks/useSeriesPage.js';

export function SeriesCreateAction(): React.JSX.Element | null {
  const page = useSeriesPage('');
  const [open, setOpen] = useState(false);
  if (!page.canCreate)
    return page.authorityError ? (
      <StatePanel
        status="error"
        error={page.authorityError}
        onRetry={page.retryAuthority}
      />
    ) : null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        New series
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
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void page.save(null, String(data.get('name') ?? ''), () => setOpen(false));
          }}
        >
          <Field label="New series name" name="name" required maxLength={200} />
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
