import { describe, expect, it } from 'vitest';
import { couldBeCommittedDespiteError, isRideTransitionConfirmed } from '../rideTransitionRecovery';

describe('V46.7: reconciliacao de transicoes', () => {
  it('consulta somente apos timeout ou indisponibilidade', () => {
    expect(couldBeCommittedDespiteError({ code: 'functions/unavailable' })).toBe(true);
    expect(couldBeCommittedDespiteError({ code: 'functions/deadline-exceeded' })).toBe(true);
    expect(couldBeCommittedDespiteError({ code: 'functions/permission-denied' })).toBe(false);
    expect(couldBeCommittedDespiteError({ code: 'functions/failed-precondition' })).toBe(false);
    expect(couldBeCommittedDespiteError(new Error('rede'))).toBe(false);
  });
  it('confirma inicio apenas quando atribuida ao titular e em execucao', () => {
    expect(
      isRideTransitionConfirmed('start', { assigned_to: 'u1', status: 'accepted' }, 'u1')
    ).toBe(true);
    expect(
      isRideTransitionConfirmed('start', { assigned_to: 'u2', status: 'accepted' }, 'u1')
    ).toBe(false);
    expect(isRideTransitionConfirmed('start', { assigned_to: 'u1', status: 'pending' }, 'u1')).toBe(
      false
    );
  });
  it('exige comprovante identico ao enviado para confirmar finalizacao', () => {
    const ride = { assigned_to: 'u1', status: 'completed', proof_url: 'https://example.com/a' };
    expect(isRideTransitionConfirmed('finish', ride, 'u1', 'https://example.com/a')).toBe(true);
    expect(isRideTransitionConfirmed('finish', ride, 'u1', 'https://example.com/b')).toBe(false);
    expect(isRideTransitionConfirmed('finish', ride, 'u1')).toBe(false);
    expect(isRideTransitionConfirmed('finish', ride, 'u2', 'https://example.com/a')).toBe(false);
  });
  it('nao aceita exclusao ou estado ausente como sucesso', () => {
    expect(isRideTransitionConfirmed('start', undefined, 'u1')).toBe(false);
    expect(isRideTransitionConfirmed('finish', null, 'u1', 'https://example.com/a')).toBe(false);
  });
});
