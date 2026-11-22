import { expect, progressWith, repertoireItem, test, wrongKey } from './support';

interface Target {
  symbol: string;
  voicing: number[];
  bassMidi: number | null;
  lhChord: number[] | null;
  pcs: number[];
  bassPc: number | null;
}

const targets = (ex: Record<string, unknown>) =>
  (ex.chords as { targets: Target[] }).targets.map((t) => ({ symbol: t.symbol, voicing: t.voicing, bassMidi: t.bassMidi, lhChord: t.lhChord, pcs: t.pcs, bassPc: t.bassPc }));

test.describe('Chords & progressions', () => {
  test('Drill (Wait): any octave counts, a wrong key first is noted, the chart shows symbols', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'chords', chords: { task: 'drill', set: 'triads', prompt: 'symbol', inversions: 'any', mode: 'wait' } } });
    await expect(page.locator('.chord-chart .chord-cell')).toHaveCount(8);
    const ts = await app.exercise(targets);
    const restart = page.locator('.practice-bar').getByRole('button', { name: 'Restart' });
    await expect(restart).toBeDisabled();
    for (let i = 0; i < ts.length; i++) {
      // One chord an octave up: the same pitch classes.
      const keys = i === 1 ? ts[i].voicing.map((k) => k + 12) : ts[i].voicing;
      if (i === 2) await app.tap([wrongKey(ts[i].voicing)]);
      await app.tap(keys);
      if (i === 0) await expect(restart).toBeEnabled();
    }
    await expect(app.results()).toBeVisible();
    // A drill is new material each time: new chords are the suggested action.
    await expect(app.results().getByRole('button', { name: 'New chords' })).toBeFocused();
    await expect(app.results()).toContainText('7/8');
    await expect(app.results()).toContainText(`${ts[2].symbol}: a wrong key first`);
  });

  test('Drill (Wait): a wrong key points at the hint, which shows the chord and is noted', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'chords', chords: { task: 'drill', set: 'triads', prompt: 'symbol', inversions: 'root', mode: 'wait' } } });
    const ts = await app.exercise(targets);
    const hintButton = page.locator('.practice-bar .btn', { hasText: 'Hint' });
    await app.tap([wrongKey(ts[0].voicing)]);
    // The chord is the question: a wrong key does not give it away, it points at the hint.
    await expect(page.locator('.key.is-expected')).toHaveCount(0);
    await expect(hintButton).toHaveClass(/is-nudge/);
    await expect(page.locator('.practice-message')).toHaveText('Stuck? Press ? for a hint.');
    await page.keyboard.press('Slash');
    await expect(page.locator('.key.is-expected')).toHaveCount(ts[0].voicing.length);
    await expect(hintButton).toBeDisabled();
    for (const t of ts) await app.tap(t.voicing);
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('7/8');
    await expect(app.results()).toContainText('1 hint');
    await expect(app.results()).toContainText(`${ts[0].symbol}: needed a hint`);
  });

  test('Drill (Wait): right notes over the wrong bass get a hint', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'chords', chords: { task: 'drill', set: 'triads', prompt: 'symbol', inversions: 'inversions', mode: 'wait' } } });
    const ts = await app.exercise(targets);
    // Find an inverted chord: play its tones with another chord tone lowest.
    const i = ts.findIndex((t) => t.bassPc !== null && t.bassPc !== t.voicing.map((k) => k % 12).sort((a, b) => a - b)[0]);
    for (let j = 0; j < i; j++) await app.tap(ts[j].voicing);
    const t = ts[i];
    const other = Math.min(...t.voicing.filter((k) => k % 12 !== t.bassPc));
    const keys = [other - 12, ...t.voicing];
    await app.noteOn(keys);
    await expect(page.locator('.chord-chart .badge')).toContainText('in the bass');
    await app.noteOff(keys);
    expect(await app.status()).toBe('running');
  });

  test('Drill from notes: the hands choose the staff, and the chord plays like any drill', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'chords', chords: { task: 'drill', set: 'triads', prompt: 'notation', inversions: 'inversions', drillHands: 'lh-bass', mode: 'wait' } } });
    const hands = page.getByRole('radiogroup', { name: 'Hands' });
    await expect(hands.getByRole('radio', { name: 'RH + LH bass' })).toHaveAttribute('aria-checked', 'true');
    expect(await app.exercise((ex) => ex.staves)).toEqual(['treble', 'bass']);
    await expect(page.locator('.meta-strip')).toContainText('Bass + chord');
    // The left hand plays the bass the slash chord asks for, the right hand the whole chord above it.
    const ts = await app.exercise(targets);
    for (const t of ts) await app.tap([t.bassMidi!, ...t.voicing]);
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('8/8');
  });

  test('Drill hands together: one hand alone does not advance; both hands, in either order, end 8/8', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'chords', chords: { task: 'drill', set: 'triads', prompt: 'notation', inversions: 'inversions', drillHands: 'both', mode: 'wait' } } });
    await expect(page.getByRole('radiogroup', { name: 'Hands' }).getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true');
    expect(await app.exercise((ex) => ex.staves)).toEqual(['treble', 'bass']);
    await expect(page.locator('.meta-strip')).toContainText('Both hands');
    const ts = await app.exercise(targets);
    // The right hand alone has every note name, but the left hand's chord is written too: one hand
    // at a time is not the chord, and not a wrong key either (the run below still ends 8/8).
    await app.tap(ts[0].voicing);
    await app.tap(ts[0].lhChord!);
    await expect(page.locator('.practice-message')).not.toContainText('bass');
    for (const [i, t] of ts.entries()) {
      const [first, second] = i % 2 ? [t.lhChord!, t.voicing] : [t.voicing, t.lhChord!];
      await app.noteOn(first);
      await app.noteOn(second);
      await app.noteOff([...first, ...second]);
    }
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('8/8');
  });

  test('Drill: Hands is for notes only; under symbols it stays in place, disabled, and says why', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'chords', chords: { task: 'drill', set: 'triads', prompt: 'notation', inversions: 'root', drillHands: 'lh', mode: 'wait' } } });
    expect(await app.exercise((ex) => ex.staves)).toEqual(['bass']);
    await expect(page.locator('.meta-strip')).toContainText('Bass clef');
    const hands = page.getByRole('radiogroup', { name: 'Hands' });
    const voicing = page.getByLabel('Voicing');
    const before = await voicing.boundingBox();
    await page.getByRole('radiogroup', { name: 'Shown as' }).getByRole('radio', { name: 'Symbols' }).click();
    await expect(hands.getByRole('radio')).toHaveCount(4);
    for (const radio of await hands.getByRole('radio').all()) await expect(radio).toBeDisabled();
    await expect(hands.getByRole('radio', { name: 'RH', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Off for symbols: any hand plays the chord.')).toBeVisible();
    expect(await app.exercise((ex) => ex.staves)).toEqual(['treble']);
    // Nothing below the control moves when it switches off.
    expect(await voicing.boundingBox()).toEqual(before);
    // Back to notes: the left hand is still chosen.
    await page.getByRole('radiogroup', { name: 'Shown as' }).getByRole('radio', { name: 'Notes' }).click();
    await expect(hands.getByRole('radio', { name: 'LH', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(hands.getByRole('radio', { name: 'LH', exact: true })).toBeEnabled();
    // Notes show one voicing: "any voicing" is offered for symbols only.
    await expect(voicing.locator('option')).toHaveText(['Root position', 'Inversions']);
  });

  test('Progression (Flow): on the beat moves the ladder; symbols and numerals are engraved', async ({ app, page }) => {
    // Start the item on the ladder at 120 bpm so the run is short.
    await app.open({
      settings: { lesson: 'chords', countInBars: 1, chords: { task: 'progression', progression: 'I-IV-V-I', key: 'F', hands: 'lh-bass', mode: 'flow' } },
      progress: progressWith({ 'chords/prog/I-IV-V-I/F/lh-bass': repertoireItem(120, 0) }),
    });
    await expect(page.locator('.score .chord-symbol').first()).toContainText('F');
    await expect(page.locator('.score .chord-numeral').first()).toHaveText('I');
    const ts = await app.exercise(targets);
    const clock = await app.startFlow();
    const bar = 16;
    await app.schedule(
      ts.map((t, i) => ({ tick: i * bar, keys: [t.bassMidi!, ...t.voicing], offsetMs: 10, holdMs: bar * clock.msPerTick - 120 })),
      clock,
    );
    await app.waitUntil(clock.t0 + ts.length * bar * clock.msPerTick + 1000);
    await expect(app.results()).toContainText('Tempo up: 120 → 124 bpm');
    // The voicing is written on the staff: voice leading is measured from the chart only.
    await expect(app.results()).not.toContainText('Voice leading');
    // One progression in one key: the only way on is the same again, now at the ladder's new tempo.
    const actions = app.results().locator('.results-actions .btn');
    await expect(actions).toHaveText([/Close/, /Again at 124 bpm/]);
    await expect(actions.last()).toBeFocused();
    const progress = await app.savedProgress();
    expect((progress.repertoire as Record<string, { ladderTempo: number }>)['chords/prog/I-IV-V-I/F/lh-bass'].ladderTempo).toBe(124);
  });

  test('Progression (Wait), RH + LH bass: the right hand landing first is still right first time', async ({ app }) => {
    await app.open({
      settings: { lesson: 'chords', chords: { task: 'progression', progression: 'I-V-vi-IV', key: 'C', hands: 'lh-bass', mode: 'wait' } },
    });
    const ts = await app.exercise(targets);
    for (const t of ts) {
      // The right hand a moment before the left: the chord waits for the written bass.
      await app.noteOn(t.voicing);
      await app.noteOn([t.bassMidi!]);
      await app.noteOff([t.bassMidi!, ...t.voicing]);
    }
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('8/8');
    await expect(app.results()).not.toContainText('in the bass');
  });

  test('Progression (Wait) from the staff: a chord tone under the written bass asks for the bass', async ({ app, page }) => {
    await app.open({
      settings: { lesson: 'chords', chords: { task: 'progression', progression: 'I-V-vi-IV', key: 'C', hands: 'lh-bass', mode: 'wait' } },
    });
    await expect(page.locator('.practice-message')).toHaveText('Play the chord as written.');
    const ts = await app.exercise(targets);
    // G2 under C E G, where C3 is written.
    await app.noteOn([ts[0].bassMidi! - 5, ...ts[0].voicing]);
    await expect(page.locator('.practice-message')).toHaveText('Put C in the bass.');
    await app.noteOff([ts[0].bassMidi! - 5]);
    await app.noteOn([ts[0].bassMidi!]);
    await app.noteOff([ts[0].bassMidi!, ...ts[0].voicing]);
    for (const t of ts.slice(1)) await app.tap([t.bassMidi!, ...t.voicing]);
    await expect(app.results()).toContainText('7/8');
    await expect(app.results()).toContainText('C: wrong note in the bass');
  });

  test('Progression from the chart: any voicing with any hand, Hands off, its own item', async ({ app, page }) => {
    await app.open({
      settings: { lesson: 'chords', chords: { task: 'progression', progression: 'I-V-vi-IV', key: 'C', hands: 'lh-bass', notation: false, mode: 'wait' } },
    });
    const hands = page.getByRole('radiogroup', { name: 'Hands' });
    for (const radio of await hands.getByRole('radio').all()) await expect(radio).toBeDisabled();
    await expect(hands.getByRole('radio', { name: 'RH', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Off for symbols: any hand plays the chord.')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Shown as' }).getByRole('radio', { name: 'Symbols' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.practice-message')).toHaveText('Play the chord in any octave.');
    expect(await app.exercise((ex) => (ex.chords as { itemId: string }).itemId)).toBe('chords/prog/I-V-vi-IV/C/chart');
    const ts = await app.exercise(targets);
    // Each chord an octave up, with its root doubled below: the right notes count, wherever they are.
    for (const t of ts) await app.tap([t.voicing[0] - 12, ...t.voicing.map((k) => k + 12)]);
    await expect(app.results()).toContainText('8/8');
    await expect(app.results()).toContainText('Voice leading');
  });

  test('Progression: Shown as switches staff and chart without moving the panel', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'chords', chords: { task: 'progression', progression: 'I-V-vi-IV', key: 'C', hands: 'lh-bass', mode: 'wait' } } });
    const shown = page.getByRole('radiogroup', { name: 'Shown as' });
    const hands = page.getByRole('radiogroup', { name: 'Hands' });
    await expect(shown.getByRole('radio', { name: 'Notes' })).toHaveAttribute('aria-checked', 'true');
    await expect(hands.getByRole('radio', { name: 'RH + LH bass' })).toBeEnabled();
    const ladder = page.getByText('Tempo ladder', { exact: true });
    const before = await ladder.boundingBox();
    await shown.getByRole('radio', { name: 'Symbols' }).click();
    await expect(page.locator('.chord-chart')).toBeVisible();
    await expect(hands.getByRole('radio', { name: 'RH + LH bass' })).toBeDisabled();
    expect(await ladder.boundingBox()).toEqual(before);
    await shown.getByRole('radio', { name: 'Notes' }).click();
    await expect(hands.getByRole('radio', { name: 'RH + LH bass' })).toHaveAttribute('aria-checked', 'true');
  });

  test('Shown as and Hands are the same two rows in every task, and nothing moves between the tasks', async ({ app, page }) => {
    await app.open({
      settings: { lesson: 'chords', chords: { task: 'drill', set: 'triads', prompt: 'notation', inversions: 'root', drillHands: 'lh-bass', hands: 'lh-bass', mode: 'wait' } },
    });
    const task = page.getByRole('radiogroup', { name: 'Task' });
    const shown = page.getByRole('radiogroup', { name: 'Shown as' });
    const hands = page.getByRole('radiogroup', { name: 'Hands' });
    const hint = page.getByText('What each hand plays is written on the staff.');
    const ladder = page.getByText('Tempo ladder', { exact: true });
    const boxes = async () => [await shown.boundingBox(), await hands.boundingBox(), await hint.boundingBox(), await ladder.boundingBox()];

    await expect(hands.getByRole('radio')).toHaveText(['RH', 'LH', 'RH + LH bass', 'Both']);
    await expect(hands.getByRole('radio', { name: 'RH + LH bass' })).toHaveAttribute('aria-checked', 'true');
    const drill = await boxes();

    await task.getByRole('radio', { name: 'Progressions' }).click();
    await expect(page.getByLabel('Progression', { exact: true })).toBeVisible();
    // The same words for the same things; progressions are voiced for the right hand, alone or over the bass.
    await expect(shown.getByRole('radio')).toHaveText(['Symbols', 'Notes']);
    await expect(hands.getByRole('radio')).toHaveText(['RH', 'RH + LH bass']);
    await expect(hands.getByRole('radio', { name: 'RH + LH bass' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.meta-strip')).toContainText('RH + LH bass');
    expect(await boxes()).toEqual(drill);

    // Each task keeps its own choice of how it is shown.
    await shown.getByRole('radio', { name: 'Symbols' }).click();
    await expect(page.locator('.chord-chart')).toBeVisible();
    await task.getByRole('radio', { name: 'Chord drill' }).click();
    await expect(shown.getByRole('radio', { name: 'Notes' })).toHaveAttribute('aria-checked', 'true');
    expect(await boxes()).toEqual(drill);

    // Inversions: the same rows again, for each hand alone or both together, and two fields under them.
    await task.getByRole('radio', { name: 'Inversions' }).click();
    await expect(page.getByLabel('Chord', { exact: true })).toBeVisible();
    await expect(shown.getByRole('radio')).toHaveText(['Symbols', 'Notes']);
    await expect(hands.getByRole('radio')).toHaveText(['RH', 'LH', 'Both']);
    await expect(hands.getByRole('radio', { name: 'RH', exact: true })).toHaveAttribute('aria-checked', 'true');
    expect(await boxes()).toEqual(drill);
    await hands.getByRole('radio', { name: 'Both' }).click();
    await expect(page.locator('.meta-strip')).toContainText('Hands together');
    await task.getByRole('radio', { name: 'Progressions' }).click();
    await expect(shown.getByRole('radio', { name: 'Symbols' })).toHaveAttribute('aria-checked', 'true');
    await task.getByRole('radio', { name: 'Inversions' }).click();
    await expect(hands.getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true');
    expect(await boxes()).toEqual(drill);
  });

  test('Inversions (Wait): one chord up and back, as written, with fingering and the guide', async ({ app, page }) => {
    await app.open({
      settings: { lesson: 'chords', showKeyboardGuide: true, chords: { task: 'sequence', sequenceChord: 'maj', sequenceKey: 'C', sequenceHands: 'both', mode: 'wait' } },
    });
    await expect(page.locator('.meta-strip')).toContainText('C major inversions');
    await expect(page.locator('.item-status')).toContainText('C major inversions · hands together');
    await expect(page.locator('.item-status')).toContainText('One chord every 2 beats');
    await expect(page.locator('.score .chord-symbol')).toHaveText(['C', 'C/E', 'C/G', 'C', 'C/G', 'C/E', 'C']);
    expect(await app.exercise((ex) => [ex.staves, ex.bars, (ex.chords as { itemId: string }).itemId])).toEqual([['treble', 'bass'], 4, 'chords/seq/maj/C/both']);
    // Fingering is stacked at each chord: three numbers for each hand.
    await expect(page.locator('.score .pp-finger')).toHaveCount(42);
    await expect(page.locator('.score .pp-finger[data-step="1"]')).toHaveText(['1', '2', '5', '1', '3', '5']);
    const ts = await app.exercise(targets);
    // A known pattern, not a question: the guide shows the shape to play, both hands.
    await expect(page.locator('.key.is-expected')).toHaveCount(6);
    // The right hand an octave too high is not what is written.
    await app.tap(ts[0].voicing.map((k) => k + 12));
    expect(await app.status()).toBe('running');
    await expect(page.locator('.practice-message')).toHaveText('Play the chord as written.');
    for (const t of ts) await app.tap([...t.lhChord!, ...t.voicing]);
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('6/7');
    await expect(app.results()).toContainText('Needs every chord right the first time.');
    await expect(app.results()).toContainText('C going up: a wrong key first');
    // Repertoire: the same again leads.
    await expect(app.results().locator('.results-actions .btn')).toHaveText([/Close/, /Again/]);
    await page.keyboard.press('Escape');
    // Fingering can be switched off; the score gives the room back.
    const height = (await page.locator('.score-svg').boundingBox())!.height;
    await page.getByRole('switch', { name: 'Fingering' }).click();
    await expect(page.locator('.score .pp-finger')).toHaveCount(0);
    await expect(page.locator('.score .chord-symbol')).toHaveCount(7);
    expect((await page.locator('.score-svg').boundingBox())!.height).toBeLessThan(height);
    await expect.poll(async () => (await app.savedSettings()).chords).toMatchObject({ showFingering: false });
  });

  test('Inversions (Flow): a chord on beats 1 and 3; every chord on the beat moves the ladder', async ({ app, page }) => {
    await app.open({
      settings: { lesson: 'chords', countInBars: 1, chords: { task: 'sequence', sequenceChord: 'min', sequenceKey: 'A', sequenceHands: 'rh', mode: 'flow' } },
      progress: progressWith({ 'chords/seq/min/A/rh': repertoireItem(120, 0) }),
    });
    await expect(page.locator('.score .chord-symbol')).toHaveText(['Am', 'Am/C', 'Am/E', 'Am', 'Am/E', 'Am/C', 'Am']);
    const ticks = await app.exercise((ex) => (ex.chords as { targets: { tick: number }[] }).targets.map((t) => t.tick));
    expect(ticks).toEqual([0, 8, 16, 24, 32, 40, 48]);
    const ts = await app.exercise(targets);
    const clock = await app.startFlow();
    await app.schedule(
      ts.map((t, i) => ({ tick: ticks[i], keys: t.voicing, offsetMs: 10, holdMs: 6 * clock.msPerTick })),
      clock,
    );
    await app.waitUntil(clock.t0 + 4 * clock.msPerTick);
    await expect(page.locator('.practice-message')).toHaveText('Play a chord on beats 1 and 3.');
    // The last chord is a whole note: the run ends after bar 4.
    await app.waitUntil(clock.t0 + 64 * clock.msPerTick + 1000);
    await expect(app.results()).toContainText('7/7');
    await expect(app.results()).toContainText('Tempo up: 120 → 124 bpm');
    await expect(app.results().locator('.results-actions .btn')).toHaveText([/Close/, /Again at 124 bpm/]);
    const progress = await app.savedProgress();
    expect((progress.repertoire as Record<string, { ladderTempo: number }>)['chords/seq/min/A/rh'].ladderTempo).toBe(124);
    // A sequence is not about finding chords: it stays out of the chord statistics.
    expect((progress.stats as Record<string, unknown>).chordQuality).toBeUndefined();
  });

  test('Inversions (Flow): one missed chord keeps the tempo, and the results say where it was', async ({ app }) => {
    await app.open({
      settings: { lesson: 'chords', countInBars: 1, chords: { task: 'sequence', sequenceChord: 'maj', sequenceKey: 'C', sequenceHands: 'lh', mode: 'flow' } },
      progress: progressWith({ 'chords/seq/maj/C/lh': repertoireItem(120, 0) }),
    });
    expect(await app.exercise((ex) => ex.staves)).toEqual(['bass']);
    const ts = await app.exercise(targets);
    const clock = await app.startFlow();
    await app.schedule(
      ts.flatMap((t, i) => (i === 4 ? [] : [{ tick: i * 8, keys: t.voicing, offsetMs: 10, holdMs: 6 * clock.msPerTick }])),
      clock,
    );
    await app.waitUntil(clock.t0 + 64 * clock.msPerTick + 1000);
    await expect(app.results()).toContainText('6/7');
    await expect(app.results()).toContainText('A clean run needs every chord and 75% timing.');
    await expect(app.results()).toContainText('C/G going down: missed');
    await expect(app.results()).toContainText('Tempo stays at 120 bpm');
  });

  test('Inversions from symbols: the chart, any octave with any hand, and the inversion in the bass', async ({ app, page }) => {
    await app.open({
      settings: { lesson: 'chords', chords: { task: 'sequence', sequenceChord: 'maj', sequenceKey: 'Eb', sequenceHands: 'both', sequenceNotation: false, mode: 'wait' } },
    });
    await expect(page.locator('.chord-chart .chord-cell-symbol')).toHaveText(['E♭', 'E♭/G', 'E♭/B♭', 'E♭', 'E♭/B♭', 'E♭/G', 'E♭']);
    const hands = page.getByRole('radiogroup', { name: 'Hands' });
    for (const radio of await hands.getByRole('radio').all()) await expect(radio).toBeDisabled();
    await expect(page.getByText('Off for symbols: any hand plays the chord.')).toBeVisible();
    await expect(page.locator('.meta-strip')).toContainText('Any');
    expect(await app.exercise((ex) => (ex.chords as { itemId: string }).itemId)).toBe('chords/seq/maj/Eb/chart');
    const ts = await app.exercise(targets);
    await app.tap(ts[0].voicing.map((k) => k - 24));
    // E♭/G with E♭ lowest: the right notes, the wrong bass.
    await app.noteOn([ts[1].voicing[2] - 12, ts[1].voicing[0], ts[1].voicing[1]]);
    await expect(page.locator('.practice-message')).toHaveText('Right notes. Put G in the bass.');
    await app.noteOff([ts[1].voicing[2] - 12, ts[1].voicing[0], ts[1].voicing[1]]);
    for (const t of ts.slice(1)) await app.tap(t.voicing.map((k) => k + 12));
    await expect(app.results()).toContainText('6/7');
    await expect(app.results()).toContainText('E♭/G going up: wrong note in the bass');
    // Back to notes: both hands are still chosen.
    await page.keyboard.press('Escape');
    await page.getByRole('radiogroup', { name: 'Shown as' }).getByRole('radio', { name: 'Notes' }).click();
    await expect(hands.getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true');
    expect(await app.exercise((ex) => ex.staves)).toEqual(['treble', 'bass']);
  });

  test('Inversions: the key keeps its place when the chord changes, shuffle moves on, and review shows the item', async ({ app, page }) => {
    await app.open({
      settings: { lesson: 'chords', keyboardSize: 49, chords: { task: 'sequence', sequenceChord: 'maj', sequenceKey: 'Db', sequenceHands: 'rh', mode: 'wait' } },
      progress: progressWith({ 'chords/seq/min/G/both': repertoireItem(72, -1) }),
    });
    await expect(page.locator('.meta-strip')).toContainText('D♭ major inversions');
    await page.getByLabel('Chord', { exact: true }).selectOption('min');
    await expect(page.locator('.meta-strip')).toContainText('C♯ minor inversions');
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('C#');
    // The sequence is placed on the player's keyboard: 49 keys end at C6.
    await page.getByLabel('Chord', { exact: true }).selectOption('maj');
    await page.getByLabel('Key', { exact: true }).selectOption('F#');
    expect(await app.exercise((ex) => ex.range)).toEqual({ min: 54, max: 73 });
    // Shuffle: each run of the sequence is in another key.
    await page.getByLabel('Key', { exact: true }).selectOption('shuffle');
    const first = await app.exercise((ex) => (ex.chords as { itemId: string }).itemId);
    await app.playSteps();
    await expect(app.results().locator('.results-actions .btn')).toHaveText([/Close/, /Again/, /Next key/]);
    await page.keyboard.press('KeyN');
    await expect.poll(() => app.exercise((ex) => (ex.chords as { itemId: string }).itemId)).not.toBe(first);
    // Review: the due item is on screen and the panel shows it.
    await page.getByRole('switch', { name: 'Review due items' }).click();
    await expect.poll(() => app.exercise((ex) => (ex.chords as { itemId: string }).itemId)).toBe('chords/seq/min/G/both');
    await expect(page.getByLabel('Chord', { exact: true })).toHaveValue('min');
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('G');
    await expect(page.getByRole('radiogroup', { name: 'Hands' }).getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true');
    expect(await app.exercise((ex) => ex.bpm)).toBe(72);
  });

  test('Review plays due items first', async ({ app }) => {
    await app.open({
      settings: { lesson: 'chords', chords: { source: 'review' } },
      progress: progressWith({ 'chords/prog/canon/Eb/rh': repertoireItem(68, -1) }),
    });
    expect(await app.exercise((ex) => (ex.chords as { itemId: string }).itemId)).toBe('chords/prog/canon/Eb/rh');
    expect(await app.exercise((ex) => ex.bpm)).toBe(68);
  });

  test('Keys and held notes are spelled as the chord asked for', async ({ app, page }) => {
    // F♯ major: the V chord is C♯ E♯ G♯, so the F key reads E♯ while it is asked for.
    await app.open({
      settings: { lesson: 'chords', showKeyNames: true, chords: { task: 'progression', progression: 'I-V-vi-IV', key: 'F#', hands: 'rh', mode: 'wait' } },
    });
    const ts = await app.exercise(targets);
    const eSharp = ts[1].voicing.find((k) => k % 12 === 5)!;
    const keyLabel = page.locator(`.key[data-midi="${eSharp}"] .key-label`);
    await expect(keyLabel).toHaveText('F');
    await app.tap(ts[0].voicing);
    await expect(keyLabel).toHaveText('E♯');
    // Part of the chord held (the whole chord would move on to the next one).
    await app.noteOn([eSharp]);
    await expect(page.locator('.keyboard-tags .tag')).toHaveText([`E♯${Math.floor(eSharp / 12) - 1}`]);
  });
});
