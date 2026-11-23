/** Predicados puros: nunca confundir estado em cache com confirmação do servidor. */
export type TransitionAction = 'start' | 'finish';

type RideState = {
  assigned_to?: unknown;
  status?: unknown;
  proof_url?: unknown;
};

/** Apenas erros de transporte/timeout justificam consultar se a operação foi gravada. */
export function couldBeCommittedDespiteError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code).toLowerCase()
      : '';
  return [
    'functions/unavailable',
    'functions/deadline-exceeded',
    'unavailable',
    'deadline-exceeded',
  ].includes(code);
}

/** Verificação de igualdade estrita: não dar sucesso para outra corrida, outro motoboy ou outra foto. */
export function isRideTransitionConfirmed(
  action: TransitionAction,
  state: RideState | null | undefined,
  userId: string,
  expectedProofUrl?: string
): boolean {
  if (!state || !userId || state.assigned_to !== userId) return false;
  if (action === 'start') return state.status === 'accepted';
  return (
    state.status === 'completed' &&
    typeof expectedProofUrl === 'string' &&
    expectedProofUrl.length > 0 &&
    state.proof_url === expectedProofUrl
  );
}
