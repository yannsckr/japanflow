/** Mensagens seguras para erros operacionais no aplicativo do motoboy.
 * Falha de rede não comprova falha de gravação; não sugerir repetição imediata.
 */
export function rideOperationErrorMessage(error: unknown): string {
  const rawCode =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  const code = typeof rawCode === 'string' ? rawCode.toLowerCase() : '';

  if (
    [
      'functions/unavailable',
      'functions/deadline-exceeded',
      'unavailable',
      'deadline-exceeded',
      'network-request-failed',
      'auth/network-request-failed',
      'functions/internal',
    ].includes(code)
  ) {
    return 'Não foi possível confirmar a operação. Aguarde a sincronização e confira o status da corrida antes de tentar novamente.';
  }
  if (
    [
      'functions/failed-precondition',
      'functions/already-exists',
      'functions/not-found',
      'failed-precondition',
    ].includes(code)
  ) {
    return 'A corrida ou a jornada foi alterada. Atualize os dados e confira a situação antes de continuar.';
  }
  if (['functions/permission-denied', 'permission-denied', 'storage/unauthorized'].includes(code)) {
    return 'Você não tem permissão para concluir esta ação. Confira seu acesso com a equipe.';
  }
  if (['functions/unauthenticated', 'unauthenticated', 'auth/user-token-expired'].includes(code)) {
    return 'Sua sessão não está autorizada. Faça login novamente antes de continuar.';
  }
  if (['storage/retry-limit-exceeded', 'storage/canceled', 'storage/unknown'].includes(code)) {
    return 'Não foi possível confirmar o envio da foto. Verifique a conexão e o status da corrida antes de enviar novamente.';
  }
  // Preserva validações locais e mensagens operacionais específicas (sem expor stack traces).
  if (error instanceof Error && !code && error.message.trim()) {
    return error.message;
  }
  return 'Não foi possível concluir a operação. Confira a sincronização e tente novamente somente se a corrida continuar pendente.';
}
