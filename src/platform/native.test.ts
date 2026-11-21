// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleBack } from './native';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('handleBack (the Android back gesture)', () => {
  it('does nothing and says so when nothing is open', () => {
    document.body.innerHTML = '<main><button>Start</button></main>';
    expect(handleBack()).toBe(false);
  });

  it('sends Escape to an open dialog, where the window listeners hear it', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"><button id="close">Close</button></div>';
    const escape = vi.fn();
    const listener = (e: KeyboardEvent) => e.key === 'Escape' && escape();
    window.addEventListener('keydown', listener);
    document.getElementById('close')!.focus();
    expect(handleBack()).toBe(true);
    window.removeEventListener('keydown', listener);
    expect(escape).toHaveBeenCalledTimes(1);
  });

  it('sends Escape into an open menu, which handles it on its own element', () => {
    document.body.innerHTML = '<div class="keyboard-menu"><button aria-haspopup="dialog" aria-expanded="true">Keyboard display</button></div>';
    const menu = document.querySelector('.keyboard-menu')!;
    const escape = vi.fn();
    menu.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Escape' && escape());
    expect(handleBack()).toBe(true);
    expect(escape).toHaveBeenCalledTimes(1);
  });

  it('closes the sidebar drawer through its backdrop', () => {
    document.body.innerHTML = '<div class="drawer-backdrop"></div>';
    const click = vi.fn();
    document.querySelector('.drawer-backdrop')!.addEventListener('click', click);
    expect(handleBack()).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
