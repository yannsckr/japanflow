import { describe, expect, it, vi } from 'vitest';
import { withRideOperationLock } from '../rideOperationLock';

describe('V46.8 - exclusao mutua de operacoes de corrida', () => {
  it('impede dois comandos simultaneos para a mesma corrida', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const work = vi.fn(async () => { await gate; return 'ok'; });
    const first = withRideOperationLock('ride-1', work);
    await expect(withRideOperationLock('ride-1', work)).rejects.toThrow(/operação em andamento/);
    expect(work).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toBe('ok');
    await expect(withRideOperationLock('ride-1', async () => 'novamente')).resolves.toBe('novamente');
  });

  it('libera o bloqueio quando a operacao falha', async () => {
    await expect(withRideOperationLock('ride-fail', async () => { throw new Error('rede'); })).rejects.toThrow('rede');
    await expect(withRideOperationLock('ride-fail', async () => true)).resolves.toBe(true);
  });

  it('permite comandos simultaneos para corridas diferentes', async () => {
    const result = await Promise.all([
      withRideOperationLock('ride-a', async () => 1),
      withRideOperationLock('ride-b', async () => 2),
    ]);
    expect(result).toEqual([1, 2]);
  });

  it('rejeita identificador vazio sem executar trabalho', async () => {
    const work = vi.fn(async () => true);
    await expect(withRideOperationLock('  ', work)).rejects.toThrow(/Identificador/);
    expect(work).not.toHaveBeenCalled();
  });
});
