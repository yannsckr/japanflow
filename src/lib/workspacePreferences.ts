export type WorkspaceItem = { id: string; slot: 'main' | 'side' };

// Keep temporarily unavailable blocks so permission/loading changes cannot erase preferences.
export function reconcileWorkspace(saved: unknown, defaults: WorkspaceItem[]): WorkspaceItem[] {
  const next: WorkspaceItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (
        !item ||
        typeof item.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) ||
        seen.has(item.id) ||
        (item.slot !== 'main' && item.slot !== 'side')
      )
        continue;
      seen.add(item.id);
      next.push({ id: item.id, slot: item.slot });
    }
  }
  for (const item of defaults) {
    if (!seen.has(item.id)) {
      next.push(item);
      seen.add(item.id);
    }
  }
  return next;
}
