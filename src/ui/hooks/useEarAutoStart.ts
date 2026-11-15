import { type RefObject, useEffect } from 'react';
import { audioEngine } from '../../platform/audio/audioEngine';
import type { Session } from '../practice/session';

/** Set when the player asks for a new exercise: the session that was on screen then. */
export type AutoStartFrom = { session: Session | null } | null;

/**
 * Ear training: a phrase the player asked for (Next, New phrase, easier / harder, retry) plays by
 * itself once audio has been unlocked. Opening the lesson or changing a setting waits for Listen.
 * `autoStartFromRef` is armed by the studio; the next session to arrive plays once.
 */
export function useEarAutoStart(autoStartFromRef: RefObject<AutoStartFrom>, controller: Session, autoStart: boolean): void {
  useEffect(() => {
    const armed = autoStartFromRef.current;
    if (!armed || armed.session === controller) return;
    if (!autoStart || !audioEngine.isRunning) {
      autoStartFromRef.current = null;
      return;
    }
    const t = setTimeout(() => {
      autoStartFromRef.current = null;
      controller.start();
    }, 350);
    return () => clearTimeout(t);
  }, [autoStartFromRef, controller, autoStart]);
}
