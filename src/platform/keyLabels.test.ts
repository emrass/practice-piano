import { describe, expect, it } from 'vitest';
import { backspaceLabel } from './keyLabels';

describe('backspaceLabel', () => {
  it('names the key as Apple keyboards print it', () => {
    expect(backspaceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15')).toBe('Delete');
    expect(backspaceLabel('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe('Delete');
  });

  it('says Backspace everywhere else', () => {
    expect(backspaceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0')).toBe('Backspace');
    expect(backspaceLabel('Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0')).toBe('Backspace');
  });
});
