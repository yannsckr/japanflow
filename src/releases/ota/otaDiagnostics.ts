export type OtaDiagnosticEvent =
  'download-start' | 'activation-requested' | 'confirmed' | 'failed' | 'deferred';
export function recordOtaDiagnostic(event: OtaDiagnosticEvent) {
  try {
    localStorage.setItem('japanflow:ota:diagnostic:v1', JSON.stringify({ event, at: Date.now() }));
  } catch {
    /* Diagnostics must never block operations. */
  }
}
