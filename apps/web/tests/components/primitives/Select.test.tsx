import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Select } from '../../../src/components/primitives/Select.js';

function Harness({ disabled = false }: { disabled?: boolean }): React.JSX.Element {
  const [value, setValue] = useState('b');
  return (
    <form data-testid="form">
      <span id="lbl">Letter</span>
      <Select
        label="Letter"
        labelId="lbl"
        name="letter"
        value={value}
        disabled={disabled}
        onValueChange={setValue}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
      />
    </form>
  );
}

describe('Select', () => {
  it('shows the current label, changes on choice and keeps a hidden form value', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /^Letter/ });
    expect(trigger).toHaveTextContent('Beta');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Alpha' }));
    expect(trigger).toHaveTextContent('Alpha');
    const form = screen.getByTestId('form') as HTMLFormElement;
    expect(new FormData(form).get('letter')).toBe('a');
  });

  it('keeps invalid and required descriptions on the labelled trigger', () => {
    render(<><label id="region-label" htmlFor="region">Region</label><p id="region-error">Choose a region.</p><Select id="region" label="Region" labelId="region-label" value="" options={[]} onValueChange={() => undefined} aria-invalid aria-required aria-describedby="region-error" /></>);
    const trigger = screen.getByRole('button', { name: /^Region / });
    expect(trigger).toHaveAttribute('id', 'region');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAccessibleDescription('Choose a region. Required');
    expect(trigger).not.toHaveAttribute('aria-required');
  });

  it('is not focusable when disabled', () => {
    render(<Harness disabled />);
    expect(screen.getByRole('button', { name: /^Letter/ })).toBeDisabled();
  });

  it('omits disabled values from form data and submits them once enabled', () => {
    const { rerender } = render(<Harness disabled />);
    const form = screen.getByTestId('form');
    if (!(form instanceof HTMLFormElement)) throw new Error('Expected a form');
    expect(new FormData(form).has('letter')).toBe(false);
    rerender(<Harness />);
    expect(new FormData(form).get('letter')).toBe('b');
  });
});
