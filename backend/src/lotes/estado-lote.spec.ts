import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { EstadoLote } from '../generated/prisma/enums.js';
import {
  ACCIONES_MANUALES,
  TRANSICIONES,
  accionesDisponibles,
  estadoResultante,
  puedeAplicar,
  type AccionLote,
} from './estado-lote.js';

const ESTADOS = Object.values(EstadoLote);
const ACCIONES = Object.keys(TRANSICIONES) as AccionLote[];

describe('máquina de estados del lote', () => {
  it('permite exactamente las transiciones válidas', () => {
    const validas: [EstadoLote, AccionLote, EstadoLote][] = [
      ['DISPONIBLE', 'SEPARAR', 'SEPARADO'],
      ['SEPARADO', 'LIBERAR', 'DISPONIBLE'],
      ['DISPONIBLE', 'VENDER', 'VENDIDO'],
      ['SEPARADO', 'VENDER', 'VENDIDO'],
      ['VENDIDO', 'ESCRITURAR', 'ESCRITURADO'],
      ['VENDIDO', 'DESISTIR', 'DESISTIDO'],
      ['DESISTIDO', 'REPONER', 'DISPONIBLE'],
    ];
    for (const [desde, accion, hacia] of validas) {
      expect(estadoResultante(desde, accion, 'L-1')).toBe(hacia);
    }
  });

  it('rechaza todas las demás combinaciones de estado y acción', () => {
    const permitidas = new Set(
      ACCIONES.flatMap((accion) => TRANSICIONES[accion].desde.map((desde) => `${desde}:${accion}`)),
    );
    let rechazadas = 0;
    for (const estado of ESTADOS) {
      for (const accion of ACCIONES) {
        if (permitidas.has(`${estado}:${accion}`)) continue;
        expect(() => estadoResultante(estado, accion, 'L-1'), `${estado} + ${accion}`).toThrow(ConflictException);
        expect(puedeAplicar(estado, accion)).toBe(false);
        rechazadas++;
      }
    }
    // 5 estados x 6 acciones = 30 combinaciones, 7 válidas.
    expect(rechazadas).toBe(23);
  });

  it('un lote escriturado o desistido no puede venderse, y uno vendido no puede separarse', () => {
    expect(puedeAplicar('ESCRITURADO', 'VENDER')).toBe(false);
    expect(puedeAplicar('DESISTIDO', 'VENDER')).toBe(false);
    expect(puedeAplicar('VENDIDO', 'SEPARAR')).toBe(false);
    expect(puedeAplicar('ESCRITURADO', 'DESISTIR')).toBe(false);
  });

  it('el mensaje de rechazo dice qué lote y en qué estado está', () => {
    expect(() => estadoResultante('VENDIDO', 'SEPARAR', 'L-7')).toThrow(/lote L-7: está vendido/);
  });

  it('solo se ofrecen en la ficha las acciones manuales que aplican al estado', () => {
    expect(accionesDisponibles('DISPONIBLE')).toEqual(['SEPARAR']);
    expect(accionesDisponibles('SEPARADO')).toEqual(['LIBERAR']);
    expect(accionesDisponibles('VENDIDO')).toEqual(['ESCRITURAR']);
    expect(accionesDisponibles('ESCRITURADO')).toEqual([]);
    expect(accionesDisponibles('DESISTIDO')).toEqual(['REPONER']);
    // Vender y desistir no son manuales: las ejecutan la venta y el desistimiento.
    expect(ACCIONES_MANUALES).not.toContain('VENDER');
    expect(ACCIONES_MANUALES).not.toContain('DESISTIR');
  });
});
