import { describe, expect, it } from 'vitest';
import { mergePatches, splitPatch } from './usePlan';

describe('splitPatch', () => {
  it('keeps the lessons’ own settings and the weak-spot focus in the block', () => {
    const { block, shared } = splitPatch({ sight: { level: 46 }, weakSpotFocus: true, theme: 'dark', metronomeVolume: 0.5 });
    expect(block).toEqual({ sight: { level: 46 }, weakSpotFocus: true });
    expect(shared).toEqual({ theme: 'dark', metronomeVolume: 0.5 });
  });

  it('drops a change of lesson: a block has its lesson', () => {
    expect(splitPatch({ lesson: 'ear' })).toEqual({ block: {}, shared: {} });
  });
});

describe('mergePatches', () => {
  it('merges lesson groups field by field and replaces the rest', () => {
    const merged = mergePatches({ lesson: 'scales', scales: { source: 'review' }, weakSpotFocus: false }, { scales: { mode: 'flow' }, weakSpotFocus: true });
    expect(merged).toEqual({ lesson: 'scales', scales: { source: 'review', mode: 'flow' }, weakSpotFocus: true });
  });

  it('takes either side alone', () => {
    expect(mergePatches({ sight: { level: 3 } }, undefined)).toEqual({ sight: { level: 3 } });
    expect(mergePatches(undefined, { ear: { level: 7 } })).toEqual({ ear: { level: 7 } });
  });
});
