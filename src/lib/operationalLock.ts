const activeOperations = new Map<string, number>();

let updateLocked = false;

export function getOperationalLockState() {
  return {
    updateLocked,
    activeOperations: Array.from(activeOperations.values()).reduce(
      (total, count) => total + count,
      0
    ),
  };
}

export function beginOperation(name: string): () => void {
  if (!name.trim()) {
    throw new Error('Invalid operation name');
  }

  if (updateLocked) {
    throw new Error('JapanFlow update in progress');
  }

  activeOperations.set(name, (activeOperations.get(name) ?? 0) + 1);

  let released = false;

  return () => {
    if (released) return;

    released = true;

    const count = activeOperations.get(name) ?? 0;

    if (count <= 1) {
      activeOperations.delete(name);
    } else {
      activeOperations.set(name, count - 1);
    }
  };
}

export async function withOperationalLock<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const release = beginOperation(name);

  try {
    return await operation();
  } finally {
    release();
  }
}

export function acquireUpdateLock(): (() => void) | null {
  if (updateLocked || activeOperations.size > 0) {
    return null;
  }

  updateLocked = true;

  let released = false;

  return () => {
    if (released) return;

    released = true;
    updateLocked = false;
  };
}
