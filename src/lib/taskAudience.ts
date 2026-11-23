import type { Task, User } from '@/types';

export const isJulio = (user?: User | null) =>
  Boolean(
    user?.active !== false && user?.username?.trim().toLowerCase().replace(/_+$/, '') === 'julio'
  );

export function belongsToTaskBoard(task: Task, user: User, aliases: Set<string>): boolean {
  // Os destinatarios explicitos prevalecem, inclusive quando a tarefa tem setor.
  const assigned = [task.assigneeId, ...(task.assigneeIds || [])]
    .filter(Boolean)
    .some((id) => aliases.has(String(id).trim()));
  const claimed = (task.claimedByIds || []).some((id) => aliases.has(id));
  const unassigned = !task.assigneeId && !(task.assigneeIds || []).length;
  const sectorFeed =
    user.active !== false &&
    !isJulio(user) &&
    user.sectors?.includes('expedicao') &&
    task.sector === 'expedicao' &&
    unassigned;
  return assigned || claimed || sectorFeed;
}
