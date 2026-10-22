import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import type { AppError } from '../../../errors/types.js';
export function AdminReadFailure({
  error,
  retry,
}: {
  error?: AppError;
  retry: () => void;
}) {
  return (
    <div className="stack">
      <StatePanel status="error" error={error} />
      <Button type="button" variant="secondary" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
