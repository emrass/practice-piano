import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { Icon } from './Icon';

/**
 * The design system's Dialog (design/system/components/Dialog): a scrim, the dialog with its
 * head (eyebrow, title, close), and the body and actions the caller passes as children
 * (`.dialog-body`, `.dialog-actions`). Focus moves into the dialog when it opens and returns to
 * the control that opened it when it closes. Esc is handled by the caller, which knows whether
 * another dialog is on top.
 */
export function Dialog(props: {
  title: ReactNode;
  /** The step or context above the title ("Setup · step 1 of 3"). */
  eyebrow?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  /** Close on a click on the scrim. */
  dismissible?: boolean;
  /** Full screen below 600px. */
  sheet?: boolean;
  /** Tabs between head and body: 560px wide, fixed height. */
  tabbed?: boolean;
  /** Steps (a guide): fixed height, so it never resizes between steps. */
  stepped?: boolean;
  /** Buttons beside the close button. */
  headActions?: ReactNode;
  className?: string;
  /** The dialog element, for a caller that moves focus itself (between steps). */
  dialogRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const titleId = useId();
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = props.dialogRef ?? ownRef;
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.focus();
    return () => {
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    };
  }, [ref]);

  const close = (
    <button type="button" className="icon-btn icon-btn-bare" aria-label={props.closeLabel} title={props.closeLabel} onClick={props.onClose}>
      <Icon name="close" large />
    </button>
  );

  return (
    <div className={`scrim ${props.sheet ? 'is-sheet' : ''}`} onClick={props.dismissible ? (e) => e.target === e.currentTarget && props.onClose() : undefined}>
      <div
        ref={ref}
        className={['dialog', props.tabbed ? 'dialog-tabbed' : '', props.stepped ? 'dialog-stepped' : '', props.className ?? ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="dialog-head">
          <div>
            {props.eyebrow ? <p className="dialog-eyebrow">{props.eyebrow}</p> : null}
            <h2 className="dialog-title" id={titleId}>
              {props.title}
            </h2>
          </div>
          {props.headActions ? (
            <div className="dialog-head-actions">
              {props.headActions}
              {close}
            </div>
          ) : (
            close
          )}
        </div>
        {props.children}
      </div>
    </div>
  );
}
