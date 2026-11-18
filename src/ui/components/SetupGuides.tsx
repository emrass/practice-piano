import type { Settings, SettingsPatch } from '../../core/settings';
import type { MidiService } from '../../platform/midi/midiService';
import { useHeardNote } from '../hooks/useHeardNote';
import { GuideDialog } from './GuideDialog';
import { type AudioSetupProps, useAudioSetupSteps, useLevelSteps } from './guideSteps';

/**
 * First launch: the piano & audio steps, then the level step, as one guide. Skip in the piano &
 * audio steps moves on to the level step; Skip there, Esc or ✕ close the guide. It opens by
 * itself until it was closed once (`Settings.setupGuideSeen`).
 */
export function FirstRunGuide(props: {
  settings: Settings;
  update: (patch: SettingsPatch) => void;
  midi: MidiService;
  /** The calibration dialog is on top; the guide waits underneath with its state kept. */
  hidden: boolean;
  onCalibrate: () => void;
  /** Starting levels were changed: show an exercise at the new level. */
  onLevelsChanged: () => void;
  onClose: () => void;
}) {
  // Notes played here are for the guide alone: they must not reach the exercise underneath.
  const heard = useHeardNote(!props.hidden);
  const steps = [...useAudioSetupSteps({ ...props, heard }), ...useLevelSteps(props)];
  return <GuideDialog steps={steps} name="Setup" finishLabel="Start practicing" skippable closeLabel="Close setup" hidden={props.hidden} onClose={props.onClose} />;
}

/** The piano & audio steps on their own, from "Setup guide" in Piano & audio. */
export function AudioSetupGuide(props: AudioSetupProps & { hidden: boolean; onClose: () => void }) {
  // Notes played here are for the guide alone: they must not reach the exercise underneath.
  const heard = useHeardNote(!props.hidden);
  const steps = useAudioSetupSteps({ ...props, heard });
  return <GuideDialog steps={steps} name="Setup" finishLabel="Done" skippable={false} closeLabel="Close setup" hidden={props.hidden} onClose={props.onClose} />;
}
