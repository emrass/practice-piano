import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

/**
 * One step of a guide. A guide's parts (guideSteps.tsx) supply their steps;
 * GuideDialog draws them and moves between them, so every guide looks and behaves the same.
 */
export interface GuideStep {
  id: string;
  /** The part of the guide the step belongs to. Skip moves on to the next part. */
  part: string;
  title: string;
  body: ReactNode;
  /** A screen inside the step before it ("Playing without a piano"): it has no step number of its own and is reached only through that step's `aside`. */
  within?: boolean;
  /** Left out of this run (the metronome step without a piano): not counted, never shown. */
  omitted?: boolean;
  /**
   * The way forward. By default "Next", or the guide's finish label on its last step, and it
   * goes to the next step. `to` names the step to go to instead, or `'next-part'`. `null`: this
   * step has no way forward (the way on is its `aside`).
   */
  forward?: { label?: string; disabled?: boolean; /** Why it is disabled. */ why?: string; onClick?: () => void; to?: string } | null;
  /** A second way on, beside the way forward ("I don’t have a piano here"). */
  aside?: { label: string; primary?: boolean; to: string };
  /** Runs when the player moves forward from this step (not on Back, Skip or close). */
  onLeave?: () => void;
}

/**
 * The design system's Dialog with steps: "Setup · step x of y" over the step's title, the
 * step's body, and one row of actions (Skip, Back, the step's own aside, the way forward). The
 * height is fixed (`stepped`) so the dialog never resizes between steps. Esc and ✕ close it.
 */
export function GuideDialog(props: {
  steps: GuideStep[];
  /** The eyebrow before the step number ("Setup"). */
  name: string;
  /** The way forward on the last step ("Start practicing", "Done"). */
  finishLabel: string;
  /** Offer Skip: it moves on to the next part, or closes the guide on the last part. */
  skippable: boolean;
  closeLabel: string;
  /** The calibration dialog is on top; the guide waits underneath with its state kept. */
  hidden: boolean;
  onClose: () => void;
}) {
  const { steps, hidden, onClose } = props;
  /** The steps visited, the current one last: Back returns along it. */
  const [history, setHistory] = useState<string[]>(() => [steps[0].id]);
  const dialog = useRef<HTMLDivElement>(null);
  const currentId = history[history.length - 1];

  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hidden, onClose]);

  // Each step starts from the top of the dialog for keyboard and screen-reader users.
  useEffect(() => {
    if (!hidden) dialog.current?.focus();
  }, [hidden, currentId]);

  if (hidden) return null;

  const index = Math.max(0, steps.findIndex((st) => st.id === currentId));
  const step = steps[index];
  const shown = (st: GuideStep) => !st.within && !st.omitted;
  const numbered = steps.filter(shown);
  // A screen inside a step carries that step's number.
  const owner = steps.slice(0, index + 1).filter((st) => !st.within).pop() ?? step;
  const number = numbered.indexOf(owner) + 1;

  const after = (from: number, nextPart: boolean) => steps.slice(from + 1).find((st) => shown(st) && (!nextPart || st.part !== steps[from].part));
  const go = (target: GuideStep | undefined) => (target ? setHistory((h) => [...h, target.id]) : onClose());

  const forward = step.forward === null ? null : (step.forward ?? {});
  const defaultNext = after(index, false);
  const moveForward = () => {
    step.onLeave?.();
    forward?.onClick?.();
    const to = forward?.to;
    go(to === 'next-part' ? after(index, true) : to ? steps.find((st) => st.id === to) : defaultNext);
  };
  const forwardLabel = forward?.label ?? (defaultNext || forward?.to ? 'Next' : props.finishLabel);

  return (
    <Dialog
      title={step.title}
      eyebrow={`${props.name} · step ${number} of ${numbered.length}`}
      closeLabel={props.closeLabel}
      onClose={onClose}
      stepped
      className="guide"
      dialogRef={dialog}
    >
      <div className="dialog-body">{step.body}</div>
      <div className="dialog-actions">
        {props.skippable ? (
          <button type="button" className="btn btn-ghost" onClick={() => go(after(index, true))}>
            Skip
          </button>
        ) : null}
        {history.length > 1 ? (
          <button type="button" className={`btn ${props.skippable ? '' : 'btn-ghost'}`} onClick={() => setHistory((h) => h.slice(0, -1))}>
            Back
          </button>
        ) : null}
        {step.aside ? (
          <button type="button" className={`btn ${step.aside.primary ? 'btn-primary' : ''}`} onClick={() => go(steps.find((st) => st.id === step.aside!.to))}>
            {step.aside.label}
          </button>
        ) : null}
        {forward ? (
          <button type="button" className="btn btn-primary" disabled={forward.disabled} title={forward.disabled ? forward.why : undefined} onClick={moveForward}>
            {forwardLabel}
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}
