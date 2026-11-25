import { recordOtaDiagnostic } from '../otaDiagnostics';
import { rememberOtaFailure } from '../otaFailureHistory';
import { reconcileNativeActivation } from '../otaActivationBridge';
import { useEffect } from 'react';
import { confirmOtaStartup, getOtaState, isOtaSupported } from '../otaEngine';
import {
  readActivationJournal,
  reconcileActivation,
  writeActivationJournal,
} from '../otaActivationJournal';

let startupTask: Promise<void> | null = null;

async function confirmStartup() {
  if (!isOtaSupported()) return;

  const confirmed = await confirmOtaStartup();

  if (!confirmed) return;

  const state = await getOtaState();
  if (!state) return;
  if (!(await reconcileNativeActivation(state.current.bundle.id))) return;
  const journal = readActivationJournal();

  if (!journal.known) {
    console.error('[JapanFlow OTA] Activation journal unavailable');
    return;
  }

  if (!journal.record || journal.record.status !== 'activating') return;

  const currentId = state.current.bundle.id;

  const reconciled = reconcileActivation(journal.record, currentId, confirmed);

  if (reconciled.status === 'failed') {
    rememberOtaFailure(reconciled.sequence);
  }

  writeActivationJournal(reconciled);
  if (reconciled.status === 'confirmed' || reconciled.status === 'failed')
    recordOtaDiagnostic(reconciled.status);

  console.info('[JapanFlow OTA] Activation result:', reconciled.status);
}

export default function OtaStartupReady() {
  useEffect(() => {
    if (!startupTask) {
      startupTask = confirmStartup().catch((error) => {
        startupTask = null;

        console.error('[JapanFlow OTA] Startup confirmation failed', error);
      });
    }

    void startupTask;
  }, []);

  return null;
}
