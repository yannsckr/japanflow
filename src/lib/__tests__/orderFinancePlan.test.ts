import { describe, expect, it } from 'vitest';
import { planOrderFinance } from '../orderFinancePlan';
import { belongsToTaskBoard } from '../taskAudience';
import type { Task, User } from '@/types';

const user = (id: string, username: string, sectors: string[] = []) =>
  ({ id, username, name: username, role: 'employee', active: true, sectors }) as User;
const carol = user('c', ' Carol__ ', ['financeiro']);
const patricia = user('p', 'Patrícia_', ['expedicao']);
const other = user('x', 'other', ['financeiro']);
const users = [carol, patricia, other];
const options = {
  separation: true,
  paid: false,
  nf: false,
  boleto: false,
  troca: false,
  client: 'Virage',
};

describe('financial order routing', () => {
  it('routes paid orders exclusively to Carol, even if NF and boleto are not requested', () => {
    const result = planOrderFinance(users, { ...options, paid: true });
    if (result.ok === false) throw new Error(result.error);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      title: 'Baixa de Pedido - Virage',
      assigneeId: 'c',
      sector: 'financeiro',
    });
    const task = { assigneeId: result.tasks[0].assigneeId, sector: 'financeiro' } as Task;
    expect(belongsToTaskBoard(task, carol, new Set(['c']))).toBe(true);
    expect(belongsToTaskBoard(task, other, new Set(['x']))).toBe(false);
  });
  for (const [nf, boleto] of [
    [true, false],
    [false, true],
    [true, true],
  ]) {
    it(`shares a single fiscal task with both recipients: NF=${nf}, boleto=${boleto}`, () => {
      const result = planOrderFinance(users, { ...options, nf, boleto });
      if (result.ok === false) throw new Error(result.error);
      expect(result.tasks).toHaveLength(1);
      const item = result.tasks[0];
      const task = { assigneeId: item.assigneeId, assigneeIds: item.assigneeIds } as Task;
      expect(belongsToTaskBoard(task, carol, new Set(['c']))).toBe(true);
      expect(belongsToTaskBoard(task, patricia, new Set(['p']))).toBe(true);
      expect(belongsToTaskBoard(task, other, new Set(['x']))).toBe(false);
    });
  }
  it('keeps payment independent of fiscal task completion', () => {
    const result = planOrderFinance(users, { ...options, paid: true, nf: true, boleto: true });
    if (result.ok === false) throw new Error(result.error);
    expect(result.tasks.map((task) => task.kind)).toEqual(['payment', 'documents']);
  });
  it('rejects absent, inactive or ambiguous required recipients before saving', () => {
    expect(planOrderFinance([patricia], { ...options, paid: true }).ok).toBe(false);
    expect(planOrderFinance([carol], { ...options, nf: true }).ok).toBe(false);
    expect(planOrderFinance([{ ...carol, active: false }], { ...options, paid: true }).ok).toBe(
      false
    );
    expect(
      planOrderFinance([...users, user('duplicate', 'carol')], { ...options, paid: true }).ok
    ).toBe(false);
  });
  it('does not create finance tasks for normal tasks or unpaid orders without fiscal requests', () => {
    expect(planOrderFinance([], { ...options, separation: false, paid: true })).toEqual({
      ok: true,
      tasks: [],
    });
    expect(planOrderFinance([], options)).toEqual({ ok: true, tasks: [] });
  });
});
