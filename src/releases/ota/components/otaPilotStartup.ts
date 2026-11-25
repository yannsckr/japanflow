import { recordOtaDiagnostic } from '../otaDiagnostics';
import { rememberOtaFailure } from '../otaFailureHistory';
import { getNativeSequenceState } from '../otaNativeSequence';
import { nativeUpdater } from '../../nativeUpdater';
import { confirmOtaStartup, getOtaState, isOtaSupported } from '../otaEngine';
import {
  readActivationJournal,
  reconcileActivation,
  writeActivationJournal,
} from '../otaActivationJournal';

let startupTask: Promise<boolean> | null = null;

async function confirmStartup(operationalReady: boolean): Promise<boolean> {
  if (!isOtaSupported()) return true;
  const native = await nativeUpdater.getVersion();
  const state = await getOtaState();
  if (!state) return false;
  const journal = readActivationJournal();
  if (native.versionCode >= 19) {
    const sequence = await getNativeSequenceState();
    if (!sequence) return false;
    if (sequence.pendingSequence !== 0 && sequence.pendingBundleId === state.current.bundle.id) {
      // Wait until the authenticated motoboy shell renders and its ride data loads.
      if (
        !operationalReady ||
        !journal.known ||
        journal.record?.status !== 'activating' ||
        journal.record.bundleId !== sequence.pendingBundleId ||
        journal.record.sequence !== sequence.pendingSequence
      )
        return false;
    }
  }
  const confirmed = await confirmOtaStartup();
  if (!confirmed) return false;
  if (!journal.known || !journal.record || journal.record.status !== 'activating') return true;

  const currentId = state.current.bundle.id;

  const reconciled = reconcileActivation(journal.record, currentId, confirmed);

  if (reconciled.status === 'failed') {
    rememberOtaFailure(reconciled.sequence);
  }

  writeActivationJournal(reconciled);
  if (reconciled.status === 'confirmed' || reconciled.status === 'failed')
    recordOtaDiagnostic(reconciled.status);

  console.info('[JapanFlow OTA] Activation result:', reconciled.status);
  return true;
}

export function confirmOtaPilotStartup(operationalReady = false): Promise<boolean> {
  if (!startupTask) {
    startupTask = confirmStartup(operationalReady)
      .then((done) => {
        if (!done) startupTask = null;
        return done;
      })
      .catch(() => {
        startupTask = null;
        return false;
      });
  }
  return startupTask;
}
