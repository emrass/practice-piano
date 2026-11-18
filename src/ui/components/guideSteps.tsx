import { useState } from 'react';
import { experiencePatch, type ExperienceSelection, sameSelection } from '../../core/experience';
import type { Settings, SettingsPatch } from '../../core/settings';
import { useStore } from '../../lib/store';
import type { MidiService } from '../../platform/midi/midiService';
import { ConnectStep, MetronomeStep, NoPianoStep } from './AudioSetupSteps';
import type { GuideStep } from './GuideDialog';
import { LevelStep } from './LevelStep';
import { connectedInputs } from './midiStatus';

/**
 * The steps of the setup guides, for GuideDialog: the piano & audio part and the level part.
 * Each part keeps its own state and logic; SetupGuides.tsx strings them into a guide.
 */

export interface AudioSetupProps {
  settings: Settings;
  update: (patch: SettingsPatch) => void;
  midi: MidiService;
  onCalibrate: () => void;
}

/**
 * The piano & audio steps: connect a real piano (the way the app is meant to be played), or
 * say there is none here, then line up the metronome. Without a piano the metronome step is
 * left out. Nothing is changed by a step that is left untouched.
 */
export function useAudioSetupSteps(props: AudioSetupProps & { heard: number | null }): GuideStep[] {
  const { update } = props;
  const midi = useStore(props.midi.state);
  /** Continued without a piano: the metronome step is left out. */
  const [noPiano, setNoPiano] = useState(false);
  const unsupported = midi.status === 'unsupported';

  return [
    {
      id: 'connect',
      part: 'audio',
      title: 'Connect your piano',
      body: <ConnectStep midi={midi} service={props.midi} heard={props.heard} />,
      // Where a piano cannot be connected at all, going on without one is the way forward.
      forward: unsupported
        ? null
        : { disabled: !connectedInputs(midi).length, why: 'Connect a piano first, or go on without one.', onClick: () => setNoPiano(false), to: 'metronome' },
      aside: { label: unsupported ? 'Continue without a piano' : 'I don’t have a piano here', primary: unsupported, to: 'no-piano' },
    },
    {
      id: 'no-piano',
      part: 'audio',
      within: true,
      title: 'Playing without a piano',
      body: <NoPianoStep />,
      forward: {
        label: 'Continue without a piano',
        onClick: () => {
          update({ keySound: true });
          setNoPiano(true);
        },
        to: 'next-part',
      },
    },
    {
      id: 'metronome',
      part: 'audio',
      omitted: noPiano,
      title: 'Line up the metronome',
      body: <MetronomeStep settings={props.settings} update={update} onCalibrate={props.onCalibrate} />,
    },
  ];
}

/**
 * The level step: how well you play, which sets a starting point for every lesson. It runs on
 * first launch only. The answers are saved (`Settings.experience`) when the player moves on,
 * and only if they picked something.
 */
export function useLevelSteps(props: { settings: Settings; update: (patch: SettingsPatch) => void; onLevelsChanged: () => void }): GuideStep[] {
  const [selection, setSelection] = useState<ExperienceSelection | null>(null);
  return [
    {
      id: 'level',
      part: 'level',
      title: 'How well do you play?',
      body: <LevelStep selection={selection} onChange={setSelection} />,
      onLeave: () => {
        if (!selection || sameSelection(selection, props.settings.experience)) return;
        props.update(experiencePatch(selection));
        props.onLevelsChanged();
      },
    },
  ];
}
