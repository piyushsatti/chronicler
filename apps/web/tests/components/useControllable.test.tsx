import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useControllable } from '../../src/components/primitives/useControllable.js';

describe('useControllable', () => {
  it('starts unselected without a default and accepts an internal update', () => {
    const { result } = renderHook(() => useControllable<string>({}));
    expect(result.current[0]).toBeUndefined();
    act(() => result.current[1]('a'));
    expect(result.current[0]).toBe('a');
  });

  it('initializes once from defaultValue and keeps user changes across default rerenders', () => {
    const { result, rerender } = renderHook(
      ({ defaultValue }) => useControllable<string>({ defaultValue }),
      { initialProps: { defaultValue: 'a' } },
    );
    expect(result.current[0]).toBe('a');
    rerender({ defaultValue: 'b' });
    expect(result.current[0]).toBe('a');
    act(() => result.current[1]('c'));
    expect(result.current[0]).toBe('c');
    rerender({ defaultValue: 'd' });
    expect(result.current[0]).toBe('c');
  });

  it('reports every uncontrolled interaction, including the current value', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllable<string>({ defaultValue: 'a', onChange }),
    );
    act(() => result.current[1]('b'));
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBe('b');
    expect(onChange.mock.calls).toEqual([['b'], ['b']]);
  });

  it('gives controlled props precedence and waits for parent updates while reporting interactions', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useControllable<string>({ value, defaultValue: 'default', onChange }),
      { initialProps: { value: 'a' } },
    );
    expect(result.current[0]).toBe('a');
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBe('a');
    expect(onChange.mock.calls).toEqual([['b']]);
    rerender({ value: 'b' });
    expect(result.current[0]).toBe('b');
  });

  it('treats null as controlled and undefined as uncontrolled', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: string | null | undefined }) =>
        useControllable<string | null>({ value, defaultValue: 'default', onChange }),
      { initialProps: { value: null as string | null | undefined } },
    );
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBeNull();
    expect(onChange.mock.calls).toEqual([['b']]);
    rerender({ value: undefined });
    expect(result.current[0]).toBe('default');
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
    expect(onChange.mock.calls).toEqual([['b'], [null]]);
  });

  it('preserves internal state when entering and leaving controlled mode', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string | undefined }) =>
        useControllable<string>({ value, defaultValue: 'a' }),
      { initialProps: { value: undefined as string | undefined } },
    );
    act(() => result.current[1]('b'));
    rerender({ value: 'controlled' });
    expect(result.current[0]).toBe('controlled');
    act(() => result.current[1]('c'));
    expect(result.current[0]).toBe('controlled');
    rerender({ value: undefined });
    expect(result.current[0]).toBe('b');
  });

  it('reports through the current callback after rerender', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ onChange }) => useControllable<string>({ defaultValue: 'a', onChange }),
      { initialProps: { onChange: first } },
    );
    rerender({ onChange: second });
    act(() => result.current[1]('b'));
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([['b']]);
  });
});
