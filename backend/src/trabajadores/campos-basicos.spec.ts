import { describe, expect, it } from 'vitest';
import { CAMPOS_BASICOS } from './trabajadores.service.js';

// Lo que se entrega al contratista SST no puede incluir salarios, valor día ni datos bancarios (CC-03 y CC-05). La lista es
// "blanca": si alguien agrega un campo sensible al trabajador, no llega a esa vista salvo que lo agreguen aquí a propósito.
describe('CAMPOS_BASICOS (lo que ve el contratista SST)', () => {
  it.each(['salarioBase', 'valorDia', 'banco', 'tipoCuenta', 'numeroCuenta', 'cargoNominaId', 'cargoNomina', 'pagos'])('no incluye %s', (campo) => {
    expect(Object.keys(CAMPOS_BASICOS)).not.toContain(campo);
  });
});
