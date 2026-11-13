import { useEffect, useId, useRef, useState } from 'react';
import type { Settings, SettingsPatch } from '../../core/settings';
import type { KeyboardAvailability } from '../lessons/types';
import { Field, Segmented, Toggle } from './controls';

/**
 * The keyboard's display preferences, in the bar above the keys: the keyboard guide as a
 * button of its own (the one switched mid-practice), the rest in a small menu. They apply to
 * every lesson; where one does not, it is greyed out with the reason.
 */
export function KeyboardControls(props: { settings: Settings; update: (patch: SettingsPatch) => void; availability: KeyboardAvailability }) {
  const { settings: s, update, availability: a } = props;
  const guideReason = a.unavailable?.guide;
  const guideOn = s.showKeyboardGuide && !guideReason;
  return (
    <>
      <button
        type="button"
        className={`kb-icon kb-guide ${guideOn ? 'is-on' : ''}`}
        aria-pressed={guideOn}
        aria-label="Keyboard guide"
        aria-disabled={guideReason ? true : undefined}
        title={guideReason ?? (guideOn ? 'Keyboard guide on — the keys to play light up' : 'Keyboard guide off — turn on to light up the keys to play')}
        onClick={() => {
          if (!guideReason) update({ showKeyboardGuide: !s.showKeyboardGuide });
        }}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <rect x="2.5" y="4" width="15" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7.5 4v12M12.5 4v12" stroke="currentColor" strokeWidth="1.2" />
          {guideOn ? <rect x="8.3" y="9" width="3.4" height="6.2" fill="currentColor" /> : null}
        </svg>
      </button>
      <DisplayMenu {...props} />
    </>
  );
}

function DisplayMenu(props: { settings: Settings; update: (patch: SettingsPatch) => void; availability: KeyboardAvailability }) {
  const { settings: s, update, availability: a } = props;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const qwertyReason = a.unavailable?.qwertyHints;
  return (
    <div
      className="kb-menu"
      ref={root}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button
        ref={button}
        type="button"
        className={`kb-icon ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Keyboard display"
        title="Keyboard display: note names, computer-key hints, keyboard view"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="M3 6h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="6" r="2.2" fill="currentColor" />
          <circle cx="13" cy="14" r="2.2" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="kb-popover" role="dialog" aria-label="Keyboard display" id={id}>
          <Toggle label="Note names on the keys" checked={s.showKeyNames} onChange={(showKeyNames) => update({ showKeyNames })} />
          <Toggle
            label="Computer-key hints"
            hint={qwertyReason ?? 'Show A S D F… on the keys'}
            checked={s.showQwertyHints && !qwertyReason}
            disabled={!!qwertyReason}
            onChange={(showQwertyHints) => update({ showQwertyHints })}
          />
          <Field label="Keyboard view">
            <Segmented<'fit' | 'full'>
              label="Keyboard view"
              value={s.keyboardView}
              onChange={(keyboardView) => update({ keyboardView })}
              options={[
                { value: 'fit', label: a.fitLabel ?? 'Fit to exercise' },
                { value: 'full', label: 'Full keyboard' },
              ]}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
