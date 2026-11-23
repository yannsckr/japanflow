import { describe, expect, it } from 'vitest';
import { isRideActionScreen, wasSelectedRideRemoved } from '../rideSelectionSync';

describe('sincronização da corrida selecionada', () => {
  it('limpa seleção apenas após remoção confirmada no snapshot', () => {
    expect(wasSelectedRideRemoved('ride-1', ['ride-2'], false, null)).toBe(true);
    expect(wasSelectedRideRemoved('ride-1', ['ride-1'], false, null)).toBe(false);
  });

  it('não interpreta carregamento ou erro de sincronização como exclusão', () => {
    expect(wasSelectedRideRemoved('ride-1', [], true, null)).toBe(false);
    expect(wasSelectedRideRemoved('ride-1', [], false, 'Sem conexão')).toBe(false);
    expect(wasSelectedRideRemoved(null, [], false, null)).toBe(false);
  });

  it('fecha ações vinculadas, sem desmontar mapa global', () => {
    expect(isRideActionScreen('detail')).toBe(true);
    expect(isRideActionScreen('proof')).toBe(true);
    expect(isRideActionScreen('incident')).toBe(true);
    expect(isRideActionScreen('map')).toBe(false);
    expect(isRideActionScreen('rides')).toBe(false);
    expect(isRideActionScreen('success')).toBe(false);
  });
});
