import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '../../../src/components/primitives/Checkbox.js';

function Controlled(): React.JSX.Element {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <Checkbox label="Quest signups" checked={checked} onCheckedChange={setChecked} />
      <p>{checked ? 'on' : 'off'}</p>
    </>
  );
}

describe('Checkbox', () => {
  it('is a checkbox named by its label that toggles on click and Space', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const box = screen.getByRole('checkbox', { name: 'Quest signups' });
    expect(box).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByText('Quest signups'));
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('on')).toBeInTheDocument();

    box.focus();
    await user.keyboard(' ');
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('off')).toBeInTheDocument();
  });

  it('does not change when disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Checkbox label="Reduce motion" disabled defaultChecked onCheckedChange={onCheckedChange} />,
    );
    const box = screen.getByRole('checkbox', { name: 'Reduce motion' });
    await user.click(box);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(box).toHaveAttribute('aria-disabled', 'true');
  });

  it('emits the skin classes its stylesheet selects', () => {
    render(<Checkbox label="Skinned" defaultChecked />);
    const box = screen.getByRole('checkbox', { name: 'Skinned' });
    expect(box).toHaveClass('checkbox__box');
    expect(box).toHaveAttribute('data-checked');
    expect(box.closest('label')).toHaveClass('checkbox');
  });

  it('can be named by aria-label when its row already shows what it selects', async () => {
    const onChange = vi.fn();
    render(<Checkbox ariaLabel="Select @mira" onCheckedChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select @mira' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('submits its name with a form only when checked', async () => {
    const { container } = render(
      <form>
        <Checkbox label="One way" name="directed" />
      </form>,
    );
    const form = container.querySelector('form')!;
    expect(new FormData(form).has('directed')).toBe(false);
    await userEvent.click(screen.getByRole('checkbox', { name: 'One way' }));
    expect(new FormData(form).has('directed')).toBe(true);
  });
});
