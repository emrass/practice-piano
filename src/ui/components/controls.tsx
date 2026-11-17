import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * The design system's controls (design/system/components) as React components. The look comes
 * from bundle.css; state is ARIA (aria-checked, aria-selected, aria-pressed).
 */

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  title?: string;
}

/** Index of the option an arrow, Home or End key moves to, or -1 for any other key. */
function moveIndex(key: string, index: number, count: number): number {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index + count - 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return -1;
}

/** SegmentedControl: a radiogroup; arrow keys move the selection, Tab leaves the group. */
export function Segmented<T extends string | number>(props: { label: string; value: T; options: SegmentedOption<T>[]; onChange: (value: T) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = props.options.findIndex((o) => o.value === props.value);
  const onKeyDown = (e: KeyboardEvent) => {
    const next = moveIndex(e.key, Math.max(0, selected), props.options.length);
    if (next < 0) return;
    e.preventDefault();
    props.onChange(props.options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label} onKeyDown={onKeyDown}>
      {props.options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          tabIndex={i === selected || (selected < 0 && i === 0) ? 0 : -1}
          title={o.title}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** ChoiceCard: options that need a sentence each, as a radiogroup of cards. */
export function ChoiceGroup<T extends string | number>(props: {
  label: string;
  value: T | null;
  options: { value: T; name: ReactNode; description: ReactNode }[];
  onChange: (value: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = props.options.findIndex((o) => o.value === props.value);
  const onKeyDown = (e: KeyboardEvent) => {
    const next = moveIndex(e.key, Math.max(0, selected), props.options.length);
    if (next < 0) return;
    e.preventDefault();
    props.onChange(props.options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="choice-group" role="radiogroup" aria-label={props.label} onKeyDown={onKeyDown}>
      {props.options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          tabIndex={i === selected || (selected < 0 && i === 0) ? 0 : -1}
          className="choice"
          onClick={() => props.onChange(o.value)}
        >
          <b>{o.name}</b>
          <span>{o.description}</span>
        </button>
      ))}
    </div>
  );
}

/** Tabs: a tablist that swaps one panel. Arrow keys, Home and End move between tabs. */
export function Tabs<T extends string>(props: {
  label: string;
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  /** Spread the tabs across the full width (the sidebar). */
  fill?: boolean;
  /** Id prefix for the tabs (`<idBase>-tab-<id>`); the panel is `<idBase>-panel`. */
  idBase: string;
  className?: string;
}) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const index = props.tabs.findIndex((t) => t.id === props.value);
  const onKeyDown = (e: KeyboardEvent) => {
    const next = moveIndex(e.key, index, props.tabs.length);
    if (next < 0) return;
    e.preventDefault();
    props.onChange(props.tabs[next].id);
    refs.current[props.tabs[next].id]?.focus();
  };
  return (
    <div className={['tabs', props.fill ? 'tabs-fill' : '', props.className ?? ''].filter(Boolean).join(' ')} role="tablist" aria-label={props.label} onKeyDown={onKeyDown}>
      {props.tabs.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`${props.idBase}-tab-${t.id}`}
          aria-selected={t.id === props.value}
          aria-controls={`${props.idBase}-panel`}
          tabIndex={t.id === props.value ? 0 : -1}
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Slider that previews while dragging but only commits on release (pointer up, key up, blur).
 * Expensive work (regenerating + re-engraving an exercise) therefore never runs mid-drag,
 * which keeps the layout perfectly still.
 */
export function CommitSlider(props: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onCommit: (value: number) => void;
  onPreview?: (value: number) => void;
  format?: (value: number) => ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const id = useId();
  const shown = draft ?? props.value;

  const commit = () => {
    const v = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (v !== null && v !== props.value) props.onCommit(v);
  };

  return (
    <div className={['field', props.className ?? ''].filter(Boolean).join(' ')}>
      <div className="slider-head">
        <label className="field-label" htmlFor={id}>
          {props.label}
        </label>
        <output htmlFor={id} className="slider-value">
          {props.format ? props.format(shown) : shown}
        </output>
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={shown}
        disabled={props.disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          draftRef.current = v;
          setDraft(v);
          props.onPreview?.(v);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        onTouchEnd={commit}
        style={{ ['--fill' as string]: `${((shown - props.min) / (props.max - props.min)) * 100}%` }}
      />
    </div>
  );
}

/** Switch: label and hint on the left, the switch on the right; the whole row is the target. */
export function Toggle(props: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={`switch-row ${props.disabled ? 'is-disabled' : ''}`}>
      <label htmlFor={id} className="switch-label">
        <span>{props.label}</span>
        {props.hint ? <small>{props.hint}</small> : null}
      </label>
      <button id={id} type="button" role="switch" aria-checked={props.checked} className="switch" disabled={props.disabled} onClick={() => props.onChange(!props.checked)} />
    </div>
  );
}

/** A labeled group around a control that is not a single input (a segmented control). */
export function Field(props: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{props.label}</div>
      {props.children}
      {props.hint ? <p className="field-hint">{props.hint}</p> : null}
    </div>
  );
}

export function Select<T extends string | number>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      <select
        id={id}
        className="select"
        value={String(props.value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = props.options.find((o) => String(o.value) === raw);
          if (match) props.onChange(match.value);
        }}
      >
        {props.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      {props.hint ? <p className="field-hint">{props.hint}</p> : null}
    </div>
  );
}

/** ProgressBar: always shown beside the number it draws; gold while in progress, green once complete. */
export function ProgressBar(props: { label: string; value: number; max: number; complete?: boolean; accent?: boolean; small?: boolean; className?: string }) {
  const pct = props.max > 0 ? Math.min(100, Math.max(0, (props.value / props.max) * 100)) : 0;
  const cls = ['progress', props.complete ? 'is-complete' : '', props.accent ? 'progress-accent' : '', props.small ? 'progress-sm' : '', props.className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} role="progressbar" aria-label={props.label} aria-valuenow={Math.round(props.value)} aria-valuemin={0} aria-valuemax={props.max}>
      <span style={{ ['--value' as string]: `${pct}%` }} />
    </div>
  );
}

export type CalloutTone = 'success' | 'warning' | 'danger';

const CALLOUT_ICON: Record<CalloutTone, IconName> = { success: 'check', warning: 'warning', danger: 'warning' };

/**
 * Callout: one thing to know right here. A toned callout has a title with an icon that says
 * the same thing as the color.
 */
export function Callout(props: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; className?: string; live?: boolean }) {
  const cls = ['callout', props.tone ? `callout-${props.tone}` : '', props.className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={cls} aria-live={props.live ? 'polite' : undefined}>
      {props.title ? (
        <span className="callout-title">
          {props.tone ? <Icon name={CALLOUT_ICON[props.tone]} /> : null}
          {props.title}
        </span>
      ) : null}
      {props.children ? <div>{props.children}</div> : null}
    </div>
  );
}

/** Over the Next button while a due item is on screen: which runs count as reviewing it. */
export function ReviewNote(props: { mode: 'wait' | 'flow' }) {
  return props.mode === 'flow' ? (
    <Callout className="review-note">Reviewing a due item — this run sets when it comes back.</Callout>
  ) : (
    <Callout className="review-note" tone="warning" title="Wait runs don’t count as a review">
      Reviewing a due item: it stays due until you play it in <b>Flow</b>.
    </Callout>
  );
}
