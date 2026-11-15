// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBuiltFor } from './shared';

/** `useBuiltFor(key, build)` where `build` also reads `extra`, which is not part of the key. */
function setup(initial: { key: Record<string, unknown>; extra: string }) {
  let builds = 0;
  const hook = renderHook(
    ({ key, extra }) =>
      useBuiltFor(key, () => {
        builds++;
        return { ...key, extra };
      }),
    { initialProps: initial },
  );
  return { hook, builds: () => builds };
}

describe('useBuiltFor', () => {
  it('keeps the value while the key fields are the same, even in a fresh key object', () => {
    const level = { level: 3 };
    const { hook, builds } = setup({ key: { level, seed: 1 }, extra: 'a' });
    const first = hook.result.current;
    hook.rerender({ key: { level, seed: 1 }, extra: 'a' });
    expect(hook.result.current).toBe(first);
    expect(builds()).toBe(1);
  });

  it('does not build again for a change outside the key, and reads it on the next build', () => {
    const { hook, builds } = setup({ key: { seed: 1 }, extra: 'a' });
    hook.rerender({ key: { seed: 1 }, extra: 'b' });
    expect(hook.result.current).toEqual({ seed: 1, extra: 'a' });
    hook.rerender({ key: { seed: 2 }, extra: 'b' });
    expect(hook.result.current).toEqual({ seed: 2, extra: 'b' });
    expect(builds()).toBe(2);
  });

  it('compares objects in the key by identity, like a dependency list', () => {
    const { hook, builds } = setup({ key: { level: { level: 3 } }, extra: 'a' });
    hook.rerender({ key: { level: { level: 3 } }, extra: 'a' });
    expect(builds()).toBe(2);
  });

  it('builds again when a field is added, removed or renamed', () => {
    const { hook, builds } = setup({ key: { a: undefined }, extra: 'a' });
    hook.rerender({ key: { b: undefined }, extra: 'a' });
    hook.rerender({ key: { b: undefined, c: 1 }, extra: 'a' });
    hook.rerender({ key: { b: undefined }, extra: 'a' });
    expect(builds()).toBe(4);
  });
});
