import { describe, expect, it } from 'vitest';
import { belongsToTaskBoard, isJulio } from '../taskAudience';
import type { Task, User } from '@/types';

const user = (id: string, username: string, sectors: string[]) =>
  ({ id, username, sectors, active: true, role: 'employee', name: username }) as User;
const task = (data: Partial<Task>) =>
  ({
    id: 'one',
    title: 'Tarefa',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: '',
    createdBy: 'jean',
    deadline: '',
    createdAt: '',
    updatedAt: '',
    statusHistory: [],
    ...data,
  }) as Task;
const visible = (value: Task, account: User) =>
  belongsToTaskBoard(value, account, new Set([account.id]));

describe('destinatarios e resgate Julio', () => {
  it('nao mostra tarefa individual de Ryan para outros usuarios de Expedicao', () => {
    const assigned = task({ sector: 'expedicao', assigneeId: 'ryan' });
    expect(visible(assigned, user('ryan', 'ryan', []))).toBe(true);
    expect(visible(assigned, user('joe', 'joe', ['expedicao']))).toBe(false);
    expect(visible(assigned, user('julio', 'julio', ['expedicao']))).toBe(false);
  });
  it('mantem tarefa geral da Expedicao no Kanban dos demais', () => {
    const general = task({ sector: 'expedicao' });
    expect(visible(general, user('joe', 'joe', ['expedicao']))).toBe(true);
    expect(visible(general, user('julio', 'julio', ['expedicao']))).toBe(false);
  });
  it('resgate do Julio nao duplica tarefa e acompanha conclusao', () => {
    const claimed = task({ sector: 'expedicao', claimedByIds: ['julio'] });
    expect(isJulio(user('julio', 'julio', ['expedicao']))).toBe(true);
    expect(visible(claimed, user('julio', 'julio', ['expedicao']))).toBe(true);
    expect(visible({ ...claimed, status: 'done' }, user('julio', 'julio', ['expedicao']))).toBe(
      true
    );
  });
});
