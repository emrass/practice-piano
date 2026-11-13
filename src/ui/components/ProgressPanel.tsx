import { useMemo, useRef, useState } from 'react';
import type { Clef } from '../../core/exercise';
import { LESSONS, type LessonId } from '../../core/lessons';
import { isBlackKey } from '../../core/keyboard/range';
import { midiLabel } from '../../core/music/pitch';
import {
  dayKey,
  displayStreak,
  findWeakIntervals,
  findWeakSpots,
  INTERVAL_NAMES,
  noteHeatmap,
  recentSummary,
  type ProgressState,
} from '../../core/progress/progress';
import { BackupError } from '../../persistence/profileRepository';
import { profileRepository } from '../state/useProfile';
import type { Settings } from '../../core/settings';

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

const HEAT_RANGE: Record<Clef, [number, number]> = { treble: [55, 96], bass: [28, 67] };

function heatColor(acc: number): string {
  const hue = Math.max(0, Math.min(120, (acc - 0.5) * 240));
  return `hsl(${hue} 65% 48%)`;
}

function Heatmap(props: { progress: ProgressState; clef: Clef }) {
  const heat = useMemo(() => noteHeatmap(props.progress, props.clef), [props.progress, props.clef]);
  const [lo, hi] = HEAT_RANGE[props.clef];
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  return (
    <div className="heatmap" aria-label={`${props.clef} clef accuracy by note`}>
      <div className="heatmap-label">{props.clef === 'treble' ? '𝄞 Treble' : '𝄢 Bass'}</div>
      <div className="heatmap-keys">
        {whites.map((m) => {
          const h = heat.get(m);
          const sharp = heat.get(m + 1);
          return (
            <div
              key={m}
              className="heat-key"
              title={h ? `${midiLabel(m)}: ${pct(h.accuracy)} of ${h.attempts}` : `${midiLabel(m)}: no data`}
              style={h ? { background: heatColor(h.accuracy) } : undefined}
            >
              {m % 12 === 0 ? <span>{midiLabel(m)}</span> : null}
              {sharp && isBlackKey(m + 1) ? (
                <i className="heat-sharp" style={{ background: heatColor(sharp.accuracy) }} title={`${midiLabel(m + 1)}: ${pct(sharp.accuracy)}`} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IntervalBars(props: { progress: ProgressState }) {
  const stats = props.progress.stats.interval ?? {};
  const harmony = props.progress.stats.harmony ?? {};
  const rows = INTERVAL_NAMES.map((name, semis) => ({ name, agg: stats[String(semis)] })).filter((r) => r.agg);
  const chordRows = Object.entries(harmony).map(([k, agg]) => ({
    name: k.startsWith('h') ? `${INTERVAL_NAMES[Math.min(12, Number(k.slice(1)))]} (harmonic)` : k === 'triad' ? 'Triads' : 'Sevenths',
    agg,
  }));
  if (!rows.length && !chordRows.length) return <p className="field-hint">Interval accuracy appears after your first phrases.</p>;
  return (
    <div className="clef-bars interval-bars">
      {[...rows, ...chordRows].map((r) => {
        const acc = r.agg.correct / Math.max(1, r.agg.attempts);
        return (
          <div key={r.name} className="clef-bar" title={`${r.agg.correct}/${r.agg.attempts} found unaided`}>
            <span>{r.name}</span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${acc * 100}%` }} />
            </div>
            <span>{pct(acc)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProgressPanel(props: {
  lesson: LessonId;
  progress: ProgressState;
  settings: Settings;
  onPracticeWeakSpots: () => void;
  onDataReplaced: (settings: Settings, progress: ProgressState) => void;
  storageKind: string;
}) {
  const { progress } = props;
  const ear = props.lesson === 'ear';
  const summary = recentSummary(progress, 20, props.lesson);
  const weak = useMemo(() => findWeakSpots(progress), [progress]);
  const weakIntervals = useMemo(() => findWeakIntervals(progress), [progress]);
  const lessonLevel = ear ? props.settings.earLevel : props.settings.level;
  const streak = displayStreak(progress.streak, dayKey(new Date()));
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = async (mode: 'download' | 'copy') => {
    const json = await profileRepository.exportBackup();
    if (mode === 'copy') {
      try {
        await navigator.clipboard.writeText(json);
        setMessage('Backup copied to the clipboard.');
      } catch {
        setMessage('Copy was blocked — use Download instead.');
      }
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `practice-piano-backup-${dayKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Backup downloaded.');
  };

  const importJson = async (file: File) => {
    try {
      const data = await profileRepository.importBackup(await file.text());
      props.onDataReplaced(data.settings, data.progress);
      setMessage('Backup restored.');
    } catch (err) {
      setMessage(err instanceof BackupError ? err.message : 'Could not read that file.');
    }
  };

  return (
    <div className="panel-body">
      <section className="panel-section">
        <div className="stat-tiles">
          <div className="tile">
            <span className="tile-v">{progress.xp.toLocaleString()}</span>
            <span className="tile-k">XP</span>
          </div>
          <div className="tile">
            <span className="tile-v">{streak}</span>
            <span className="tile-k">Day streak · best {progress.streak.best}</span>
          </div>
          <div className="tile">
            <span className="tile-v">{progress.exercisesCompleted}</span>
            <span className="tile-k">Exercises</span>
          </div>
          <div className="tile">
            <span className="tile-v">{pct(summary.pitchAccuracy)}</span>
            <span className="tile-k">{ear ? 'Found (last 20)' : 'Pitch (last 20)'}</span>
          </div>
          <div className="tile">
            <span className="tile-v">{ear ? summary.replays : pct(summary.timingAccuracy)}</span>
            <span className="tile-k">{ear ? 'Avg replays (last 20)' : 'Timing (Flow)'}</span>
          </div>
          <div className="tile">
            <span className="tile-v">{summary.medianReactionMs === null ? '—' : `${(summary.medianReactionMs / 1000).toFixed(2)}s`}</span>
            <span className="tile-k">Median reaction</span>
          </div>
        </div>
      </section>

      {ear ? (
        <section className="panel-section">
          <div className="section-title">Intervals</div>
          <IntervalBars progress={progress} />
          {weakIntervals.length ? (
            <p className="field-hint">Weakest: {weakIntervals.map((w) => `${INTERVAL_NAMES[w.semitones]} (${pct(w.accuracy)})`).join(', ')}</p>
          ) : null}
          <button type="button" className="btn btn-block" disabled={weakIntervals.length === 0} onClick={props.onPracticeWeakSpots}>
            Practise weak intervals
          </button>
        </section>
      ) : null}

      {ear ? null : (
      <>
      <section className="panel-section">
        <div className="section-title">Weak spots</div>
        {weak.notes.length === 0 ? (
          <p className="field-hint">No consistent weak notes yet — keep reading! Notes need a few attempts before they’re judged.</p>
        ) : (
          <ul className="weak-list">
            {weak.notes.map((n) => (
              <li key={`${n.clef}${n.midi}`}>
                <span className="weak-note">{midiLabel(n.midi)}</span>
                <span className="muted">{n.clef}</span>
                <span>{pct(n.accuracy)}</span>
                <span className="muted">{n.medianReactionMs ? `${(n.medianReactionMs / 1000).toFixed(1)}s` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {weak.clefs.length ? (
          <div className="clef-bars">
            {weak.clefs.map((c) => (
              <div key={c.clef} className="clef-bar">
                <span>{c.clef === 'treble' ? 'Treble' : 'Bass'}</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${c.accuracy * 100}%` }} />
                </div>
                <span>{pct(c.accuracy)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {weak.weakestClef ? <p className="field-hint">Your {weak.weakestClef} clef needs the most attention.</p> : null}
        <button type="button" className="btn btn-block" disabled={weak.notes.length === 0} onClick={props.onPracticeWeakSpots}>
          Practise weak spots
        </button>
      </section>

      <section className="panel-section">
        <div className="section-title">Note accuracy</div>
        <Heatmap progress={progress} clef="treble" />
        <Heatmap progress={progress} clef="bass" />
      </section>
      </>
      )}

      <section className="panel-section">
        <div className="section-title">Tier mastery · {LESSONS[props.lesson].name}</div>
        <ol className="tier-ladder">
          {LESSONS[props.lesson].tiers.map((t) => {
            const st = progress.tiers[t.id];
            const current = lessonLevel >= t.minLevel && lessonLevel <= t.maxLevel;
            return (
              <li key={t.id} className={`${st?.mastered ? 'is-mastered' : ''} ${current ? 'is-current' : ''}`}>
                <span className="tl-range">
                  {t.minLevel}–{t.maxLevel}
                </span>
                <span className="tl-name">{t.name}</span>
                <span className="tl-state">{st?.mastered ? '★' : `${Math.min(st?.passes ?? 0, t.passesRequired)}/${t.passesRequired}`}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel-section">
        <div className="section-title">Your data</div>
        <p className="field-hint">
          Saved on this device only ({props.storageKind === 'memory' ? 'temporary — storage unavailable here' : 'browser storage'}). Export a backup to move it to another device.
        </p>
        <div className="button-row">
          <button type="button" className="btn" onClick={() => void exportJson('download')}>
            Export JSON
          </button>
          <button type="button" className="btn" onClick={() => void exportJson('copy')}>
            Copy
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = '';
            }}
          />
        </div>
        {confirmReset ? (
          <div className="button-row">
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                const data = await profileRepository.reset();
                props.onDataReplaced(data.settings, data.progress);
                setConfirmReset(false);
                setMessage('All progress and settings were reset.');
              }}
            >
              Yes, erase everything
            </button>
            <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost-danger" onClick={() => setConfirmReset(true)}>
            Reset progress…
          </button>
        )}
        {message ? <p className="status-line is-ok">{message}</p> : null}
      </section>
    </div>
  );
}
