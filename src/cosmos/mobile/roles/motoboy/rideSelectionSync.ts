/**
 * A seleção da corrida só é válida enquanto ela continuar atribuída ao motoboy.
 * Não limpar por erro de conexão ou durante o primeiro carregamento: um snapshot
 * vazio de uma conexão indisponível não confirma remoção da entrega.
 */
export function wasSelectedRideRemoved(
  selectedId: string | null,
  availableIds: readonly string[],
  loading: boolean,
  syncError: string | null
): boolean {
  return Boolean(selectedId && !loading && !syncError && !availableIds.includes(selectedId));
}

export function isRideActionScreen(screen: string): boolean {
  return screen === 'detail' || screen === 'proof' || screen === 'incident';
}
