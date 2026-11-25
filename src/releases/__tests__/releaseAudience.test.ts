import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
import { isReleaseForUser, type JapanFlowRelease } from '../releaseService';
const release = (fields: Partial<JapanFlowRelease> = {}) =>
  ({
    id: 'one',
    version: '1.0.1',
    title: 'Teste',
    notes: 'Notas',
    channel: 'beta',
    status: 'published',
    mandatory: false,
    downloadUrl: '',
    ...fields,
  }) as JapanFlowRelease;
describe('destinatarios de releases', () => {
  it('preserva releases antigas para todos', () => {
    expect(isReleaseForUser(release(), 'rafael')).toBe(true);
  });
  it('filtra as releases selecionadas pelo ID', () => {
    const selected = release({ audience: 'selected', targetUserIds: ['rafael'] });
    expect(isReleaseForUser(selected, 'rafael')).toBe(true);
    expect(isReleaseForUser(selected, 'julio')).toBe(false);
    expect(isReleaseForUser(selected, null)).toBe(false);
  });
});
