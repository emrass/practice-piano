import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from './music/rhythm';
import { DEFAULT_SETTINGS, generatorSettingsFrom, normalizeSettings, readAheadTicks } from './settings';

describe('read-ahead cover setting', () => {
  it('is off by default, kept when valid and repaired when not', () => {
    expect(DEFAULT_SETTINGS.sight.readAhead).toBe('off');
    expect(normalizeSettings({ sight: { readAhead: 'half' } }).sight.readAhead).toBe('half');
    expect(normalizeSettings({ sight: { readAhead: 'page' } }).sight.readAhead).toBe('off');
    expect(normalizeSettings({ sight: { readAhead: 3 } }).sight.readAhead).toBe('off');
  });

  it('does not reach the passage generator', () => {
    const s = normalizeSettings({ sight: { readAhead: 'bar' } });
    expect(generatorSettingsFrom(s)).not.toHaveProperty('readAhead');
  });

  it('covers a beat of the time signature, half a bar or a bar', () => {
    const four = TIME_SIGNATURES['4/4'];
    const six = TIME_SIGNATURES['6/8'];
    expect(readAheadTicks('off', four)).toBe(0);
    expect(readAheadTicks('beat', four)).toBe(four.beatTicks);
    expect(readAheadTicks('half', four)).toBe(four.ticksPerBar / 2);
    expect(readAheadTicks('bar', four)).toBe(four.ticksPerBar);
    // 6/8 counts in dotted quarters.
    expect(readAheadTicks('beat', six)).toBe(six.beatTicks);
    expect(readAheadTicks('beat', six)).toBe(six.ticksPerBar / 2);
  });
});
