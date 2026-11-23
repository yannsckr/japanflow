import { describe, expect, it } from 'vitest';
import {
  activityTime,
  canOperateRide,
  completedHistory,
  newestActivityFirst,
} from '../rideSyncPolicy';

type Sample = {
  id: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
};
const ride = (id: string, status: string, completedAt: string | null = null): Sample => ({
  id,
  status,
  completedAt,
  createdAt: '2026-11-20T10:00:00.000Z',
  acceptedAt: null,
});

describe('V46.5 + V46.6: sincronizacao e historico', () => {
  it('bloqueia operacoes em dados do cache e sem conexao', () => {
    expect(canOperateRide(true, false)).toBe(false);
    expect(canOperateRide(false, true)).toBe(false);
    expect(canOperateRide(true, true)).toBe(true);
  });
  it('lista apenas entregas concluidas ainda presentes na fonte canonica', () => {
    const all = [
      ride('a', 'completed', '2026-11-20T12:00:00Z'),
      ride('b', 'accepted'),
      ride('c', 'completed', '2026-11-21T12:00:00Z'),
    ];
    expect(completedHistory(all).map((r) => r.id)).toEqual(['c', 'a']);
    expect(completedHistory(all.filter((r) => r.id !== 'a')).map((r) => r.id)).toEqual(['c']);
  });
  it('ordena atividade pelo ultimo evento conhecido sem alterar a entrada', () => {
    const original = [
      ride('old', 'completed', '2026-11-20T11:00:00Z'),
      ride('new', 'completed', '2026-11-22T11:00:00Z'),
    ];
    expect(newestActivityFirst(original).map((r) => r.id)).toEqual(['new', 'old']);
    expect(original[0].id).toBe('old');
  });
  it('aceita timestamps ausentes sem produzir NaN', () => {
    expect(
      activityTime({
        id: 'one',
        status: 'completed',
        createdAt: '',
        acceptedAt: null,
        completedAt: null,
      })
    ).toBe(0);
  });
});
