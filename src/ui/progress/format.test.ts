import { describe, expect, it } from 'vitest';
import { HEAT_BANDS, heatBand } from './format';

describe('heatBand', () => {
  it('sorts accuracy into the five bands of the Heatmap', () => {
    expect(heatBand(0)).toBe(1);
    expect(heatBand(0.59)).toBe(1);
    expect(heatBand(0.6)).toBe(2);
    expect(heatBand(0.74)).toBe(2);
    expect(heatBand(0.75)).toBe(3);
    expect(heatBand(0.84)).toBe(3);
    expect(heatBand(0.85)).toBe(4);
    expect(heatBand(0.94)).toBe(4);
    expect(heatBand(0.95)).toBe(5);
    expect(heatBand(1)).toBe(5);
  });

  it('goes by the whole percentage shown beside the key', () => {
    expect(heatBand(0.745)).toBe(3); // reads 75%
    expect(heatBand(0.744)).toBe(2); // reads 74%
    expect(heatBand(0.946)).toBe(5); // reads 95%
  });

  it('has a legend entry for every band, lowest first', () => {
    expect(HEAT_BANDS.map((b) => b.band)).toEqual([1, 2, 3, 4, 5]);
    expect(HEAT_BANDS.map((b) => b.label)).toEqual(['under 60%', '60–74%', '75–84%', '85–94%', '95% and up']);
  });
});
