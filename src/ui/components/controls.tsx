import { useId, useRef, useState, type ReactNode } from 'react';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  title?: string;
}

export function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`segmented segmented-${props.size ?? 'md'}`} role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          className={o.value === props.value ? 'is-active' : ''}
          title={o.title}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Range input that previews while dragging but only commits on release (pointer up,
 * key up, blur). Expensive work (regenerating + re-engraving an exercise) therefore never
 * runs mid-drag, which keeps the layout perfectly still.
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
    <div className={`slider-field ${props.className ?? ''}`}>
      <div className="slider-head">
        <label htmlFor={id}>{props.label}</label>
        <output htmlFor={id} className="slider-value">
          {props.format ? props.format(shown) : shown}
        </output>
      </div>
      <input
        id={id}
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

export function Toggle(props: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={`toggle-row ${props.disabled ? 'is-disabled' : ''}`}>
      <label htmlFor={id} className="toggle-label">
        <span>{props.label}</span>
        {props.hint ? <small>{props.hint}</small> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={props.checked}
        className={`switch ${props.checked ? 'is-on' : ''}`}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}

export function Field(props: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{props.label}</div>
      {props.children}
      {props.hint ? <div className="field-hint">{props.hint}</div> : null}
    </div>
  );
}

export function Select<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="select-field">
      <label htmlFor={id}>{props.label}</label>
      <select
        id={id}
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
    </div>
  );
}


/** Over the Next button while a due item is on screen: which runs count as reviewing it. */
export function ReviewNote(props: { mode: 'wait' | 'flow' }) {
  return props.mode === 'flow' ? (
    <p className="review-note">Reviewing a due item — this run sets when it comes back.</p>
  ) : (
    <p className="review-note is-wait">
      Reviewing a due item. <b>Wait</b> runs don’t count as a review: it stays due until you play it in <b>Flow</b>.
    </p>
  );
}
