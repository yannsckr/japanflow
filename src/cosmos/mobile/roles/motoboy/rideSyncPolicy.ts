/**
 * Regras puras de visualizacao de corridas. O Firestore permanece como fonte de verdade:
 * registros removidos/transferidos nao sao recriados por cache ou historico local.
 */
export type RideChronology = {
  id: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
};

const timeValue = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function activityTime(ride: RideChronology): number {
  return timeValue(ride.completedAt || ride.acceptedAt || ride.createdAt);
}

export function newestActivityFirst<T extends RideChronology>(rides: readonly T[]): T[] {
  return [...rides].sort(
    (left, right) => activityTime(right) - activityTime(left) || right.id.localeCompare(left.id)
  );
}

export function completedHistory<T extends RideChronology>(rides: readonly T[]): T[] {
  return newestActivityFirst(rides.filter((ride) => ride.status === 'completed'));
}

/** Acoes dependem de leitura validada no servidor, nunca de cache isolado. */
export function canOperateRide(online: boolean, serverConfirmed: boolean): boolean {
  return online && serverConfirmed;
}
