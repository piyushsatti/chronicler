import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from '../../src/components/foundation/Field.js';

describe('Field', () => {
  it('associates label and surfaces error', () => {
    render(<Field label="Name" error="Required" defaultValue="" />);
    expect(screen.getByLabelText('Name')).toBeInvalid();
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
});
