import { describe, expect, it } from 'vitest';
import { generatedContinuation, pianoLegend, repertoireContinuation } from './continuation';

describe('generatedContinuation', () => {
  it('offers a restart and suggests new material', () => {
    expect(generatedContinuation('New phrase')).toEqual({ repeat: { label: 'Restart' }, next: { label: 'New phrase' }, primary: 'next' });
  });
});

describe('repertoireContinuation', () => {
  it('a specific key, review off: only "Again"', () => {
    expect(repertoireContinuation({ review: false, shuffle: false })).toEqual({ repeat: { label: 'Again' }, next: null, primary: 'repeat' });
  });

  it('shuffled keys: "Again" leads, the next key is on offer', () => {
    expect(repertoireContinuation({ review: false, shuffle: true })).toEqual({ repeat: { label: 'Again' }, next: { label: 'Next key' }, primary: 'repeat' });
  });

  it('review: the next due item leads, whatever the key setting', () => {
    const review = { repeat: { label: 'Again' }, next: { label: 'Next due item' }, primary: 'next' };
    expect(repertoireContinuation({ review: true, shuffle: false })).toEqual(review);
    expect(repertoireContinuation({ review: true, shuffle: true })).toEqual(review);
  });

  it('names the tempo when the ladder moved', () => {
    expect(repertoireContinuation({ review: false, shuffle: false, movedToBpm: 80 }).repeat.label).toBe('Again at 80 bpm');
    expect(repertoireContinuation({ review: true, shuffle: false, movedToBpm: 64 }).repeat.label).toBe('Again at 64 bpm');
  });
});

describe('pianoLegend', () => {
  it('names C and D as the lesson does', () => {
    expect(pianoLegend(generatedContinuation('New rhythm'))).toEqual([
      { key: 'C', label: 'Restart' },
      { key: 'D', label: 'New rhythm' },
      { key: 'E', label: 'Close' },
      { key: 'F', label: 'Easier' },
      { key: 'G', label: 'Harder' },
    ]);
  });

  it('leaves D out when there is nothing to move on to', () => {
    const legend = pianoLegend(repertoireContinuation({ review: false, shuffle: false }));
    expect(legend.map((a) => a.key)).toEqual(['C', 'E', 'F', 'G']);
    expect(legend[0].label).toBe('Again');
  });
});
