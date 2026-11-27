import { describe, expect, it } from 'vitest';
import { reconcileWorkspace, type WorkspaceItem } from '../workspacePreferences';
describe('workspace preferences', () => {
  const saved: WorkspaceItem[] = [
    { id: 'calendar', slot: 'main' },
    { id: 'pickups', slot: 'side' },
  ];
  it('keeps layout when widgets appear or disappear', () => {
    expect(
      reconcileWorkspace(saved, [
        { id: 'calendar', slot: 'side' },
        { id: 'sector-tasks', slot: 'main' },
      ])
    ).toEqual([...saved, { id: 'sector-tasks', slot: 'main' }]);
  });
  it('salvages valid entries and removes duplicates', () => {
    expect(reconcileWorkspace([...saved, saved[0], { id: 'broken', slot: 'bad' }], [])).toEqual(
      saved
    );
  });
  it('defaults on invalid storage', () => expect(reconcileWorkspace(null, saved)).toEqual(saved));
});
