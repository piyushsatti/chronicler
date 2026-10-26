import { fireEvent, render, screen } from '@testing-library/react';
import { Profiler, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { LiveEditor } from '../../../src/features/editor/LiveEditor.js';

/**
 * Loop 3 L2: a keystroke must reach the parent in the same render as the
 * editor's own update. When the parent heard about it later, from a passive
 * effect, its draft update rendered separately and React could restore the
 * textarea to an older value, dropping a character on slow devices
 * (reproduced in Chromium by tests/e2e/editor-typing.spec.ts). jsdom cannot
 * show the dropped character, so this checks that each keystroke is one commit.
 */
describe('LiveEditor typing', () => {
  it('commits each keystroke once, together with the parent’s draft', () => {
    const values: string[] = [];
    let commits = 0;
    function Host(): React.JSX.Element {
      const [value, setValue] = useState('');
      return (
        <Profiler id="editor" onRender={() => (commits += 1)}>
          <LiveEditor
            value={value}
            onChange={(next) => {
              values.push(next);
              setValue(next);
            }}
          />
        </Profiler>
      );
    }
    render(<Host />);
    fireEvent.mouseDown(
      screen.getByText(/./, { selector: '[data-component="LiveEditor"] *' }),
    );
    const typed = [
      'f',
      'fl',
      'flo',
      'flooded',
      'flooded ',
      'flooded n',
      'flooded nave',
    ];
    for (const value of typed) {
      const before = commits;
      fireEvent.change(screen.getByRole('textbox', { name: 'Document body' }), {
        target: { value },
      });
      expect(commits - before, `commits for "${value}"`).toBe(1);
    }
    expect(values).toEqual(typed);
    expect(screen.getByRole('textbox', { name: 'Document body' })).toHaveValue(
      'flooded nave',
    );
  });
});
