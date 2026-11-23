import { describe, expect, it } from 'vitest';
import { rideOperationErrorMessage } from '../rideOperationErrors';

describe('mensagens seguras para operações de motoboy', () => {
  it.each([
    'functions/unavailable',
    'functions/deadline-exceeded',
    'functions/internal',
    'unavailable',
  ])('em falha ambígua (%s), não instrui repetir imediatamente', (code) => {
    const message = rideOperationErrorMessage({ code });
    expect(message).toContain('confira o status');
    expect(message).toContain('antes de tentar novamente');
  });
  it('identifica corrida alterada', () => {
    expect(rideOperationErrorMessage({ code: 'functions/failed-precondition' })).toContain(
      'alterada'
    );
  });
  it('identifica sessão expirada', () => {
    expect(rideOperationErrorMessage({ code: 'functions/unauthenticated' })).toContain('login');
  });
  it('identifica falha no comprovante', () => {
    expect(rideOperationErrorMessage({ code: 'storage/retry-limit-exceeded' })).toContain('foto');
  });
  it('preserva erros locais claros', () => {
    expect(rideOperationErrorMessage(new Error('A foto deve ter no máximo 12 MB.'))).toBe(
      'A foto deve ter no máximo 12 MB.'
    );
  });
  it('não apresenta mensagens internas de erro do servidor', () => {
    expect(
      rideOperationErrorMessage({
        code: 'functions/permission-denied',
        message: 'internal path /secret',
      })
    ).not.toContain('/secret');
  });
  it('fornece fallback para erro inesperado', () => {
    expect(rideOperationErrorMessage(null)).toContain('sincronização');
  });
});
