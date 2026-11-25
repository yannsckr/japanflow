import { beginOperation } from '@/lib/operationalLock';

/** Bloqueia comandos simultaneos para a mesma corrida apenas nesta instancia do app.
 * O backend continua sendo a fonte de verdade e valida cada transicao em transacao.
 */
const activeRides = new Set<string>();

export async function withRideOperationLock<T>(
  rideId: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!rideId.trim()) throw new Error('Identificador de corrida inválido.');
  if (activeRides.has(rideId)) {
    throw new Error('Já existe uma operação em andamento para esta corrida.');
  }
  const release = beginOperation(`ride:${rideId}`);
  activeRides.add(rideId);

  try {
    return await operation();
  } finally {
    activeRides.delete(rideId);
    release();
  }
}
