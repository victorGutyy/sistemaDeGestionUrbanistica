import { describe, expect, it } from 'vitest';
import type { FilaLeida } from '../importacion/leer-libro.js';
import { interpretarAsistencia, interpretarAusentismo, interpretarEntregaEpp, interpretarTrabajador } from './interpretar.js';

const fila = (celdas: FilaLeida['celdas'], numero = 2): FilaLeida => ({ fila: numero, celdas });
const mensajes = (errores: { columna?: string; mensaje: string }[]) => errores.map((e) => `${e.columna}: ${e.mensaje}`);

describe('interpretarTrabajador (RF-SST-23)', () => {
  const completa: FilaLeida['celdas'] = {
    documento: 1000000001,
    nombres: 'Persona  Inventada',
    apellidos: 'Ejemplo Uno',
    cargo: 'Oficial de obra',
    salarioBase: '$1.750.905',
    fechaIngreso: '15/01/2026',
  };

  it('lee una fila completa y convierte documento, salario y fecha', () => {
    const { datos, errores } = interpretarTrabajador(fila(completa));
    expect(errores).toEqual([]);
    expect(datos).toMatchObject({ documento: '1000000001', nombres: 'Persona Inventada', apellidos: 'Ejemplo Uno', cargo: 'Oficial de obra', salarioBase: '1750905', fechaIngreso: '2026-01-15' });
    expect(datos?.tipoDocumento).toBeUndefined();
    expect(datos?.tipoContrato).toBeUndefined();
  });

  it('traduce las listas al valor que guarda el sistema', () => {
    const { datos } = interpretarTrabajador(fila({ ...completa, tipoDocumento: 'pasaporte', tipoContrato: 'término fijo', sexo: 'femenino', fechaNacimiento: '03/05/1990' }));
    expect(datos).toMatchObject({ tipoDocumento: 'PASAPORTE', tipoContrato: 'TERMINO_FIJO', sexo: 'FEMENINO', fechaNacimiento: '1990-05-03' });
  });

  it('avisa de TODOS los problemas de la fila, cada uno en su columna', () => {
    const { datos, errores } = interpretarTrabajador(fila({ documento: 'ab', nombres: '', apellidos: 'Ejemplo', cargo: 'X', salarioBase: '1.5', fechaIngreso: '31/02/2026', email: 'sin-arroba', tipoContrato: 'Eterno' }));
    expect(datos).toBeNull();
    expect(mensajes(errores)).toEqual(
      expect.arrayContaining([
        'Documento: Mínimo 3 caracteres',
        'Nombres: Es obligatorio',
        'Cargo: Mínimo 2 caracteres',
        expect.stringMatching(/^Salario base:/),
        expect.stringMatching(/^Fecha de ingreso:/),
        'Correo: No es un correo válido',
        expect.stringMatching(/^Tipo de contrato: Debe ser una de estas opciones/),
      ]),
    );
    expect(errores.every((e) => e.hoja === 'Trabajadores' && e.fila === 2)).toBe(true);
  });
});

describe('interpretarAusentismo (RF-SST-23)', () => {
  const base: FilaLeida['celdas'] = { documento: '1000000001', tipo: 'Enfermedad general', fechaInicio: '10/03/2026', fechaFin: '14/03/2026' };

  it('lee una fila mínima y pasa el código CIE-10 a mayúsculas', () => {
    const { datos, errores } = interpretarAusentismo(fila({ ...base, cie10: 'm54.5', numeroDocumento: 'INC-1' }));
    expect(errores).toEqual([]);
    expect(datos).toEqual({ documento: '1000000001', tipo: 'Enfermedad general', fechaInicio: '2026-03-10', fechaFin: '2026-03-14', numeroDocumento: 'INC-1', cie10: 'M54.5', esProrroga: false, diasPrevios: undefined, observaciones: undefined });
  });

  it('una prórroga exige los días previos, y los días previos exigen la prórroga', () => {
    expect(mensajes(interpretarAusentismo(fila({ ...base, prorroga: 'Sí' })).errores)).toEqual(['Días previos: En una prórroga indica cuántos días llevaba acumulados la incapacidad anterior']);
    expect(interpretarAusentismo(fila({ ...base, prorroga: 'Sí', diasPrevios: 30 })).datos).toMatchObject({ esProrroga: true, diasPrevios: 30 });
    expect(mensajes(interpretarAusentismo(fila({ ...base, diasPrevios: 30 })).errores)).toEqual(['Días previos: Los días previos solo van en una prórroga: marca "Es prórroga" como Sí']);
  });

  it('rechaza un fin anterior al inicio y fechas que no existen', () => {
    expect(mensajes(interpretarAusentismo(fila({ ...base, fechaFin: '01/03/2026' })).errores)).toEqual(['Fecha de fin: La fecha de fin no puede ser anterior a la de inicio']);
    expect(mensajes(interpretarAusentismo(fila({ ...base, fechaInicio: '30/02/2026' })).errores)).toEqual([expect.stringMatching(/^Fecha de inicio:/)]);
  });

  it('las obligatorias vacías se avisan todas', () => {
    expect(mensajes(interpretarAusentismo(fila({})).errores)).toEqual(['Documento del trabajador: Es obligatorio', 'Tipo de ausentismo: Es obligatorio', 'Fecha de inicio: Es obligatorio', 'Fecha de fin: Es obligatorio']);
  });
});

describe('interpretarEntregaEpp (RF-SST-23)', () => {
  const base: FilaLeida['celdas'] = { documento: '1000000001', elemento: 'Casco de seguridad', fecha: '05/03/2026', cantidad: 2, motivo: 'Dotación inicial' };

  it('lee la fila, traduce el motivo y firma vacío es No', () => {
    expect(interpretarEntregaEpp(fila(base)).datos).toEqual({ documento: '1000000001', elemento: 'Casco de seguridad', fecha: '2026-03-05', cantidad: 2, tallaReferencia: undefined, motivo: 'DOTACION_INICIAL', entregadoPor: undefined, firmoRecibido: false });
    expect(interpretarEntregaEpp(fila({ ...base, firmo: 'sí', tallaReferencia: 'M', motivo: 'pérdida' })).datos).toMatchObject({ firmoRecibido: true, tallaReferencia: 'M', motivo: 'PERDIDA' });
  });

  it('la cantidad va de 1 a 1000 y el motivo es de la lista', () => {
    expect(mensajes(interpretarEntregaEpp(fila({ ...base, cantidad: 0 })).errores)).toEqual(['Cantidad: Debe ser un número de 1 a 1000']);
    expect(mensajes(interpretarEntregaEpp(fila({ ...base, cantidad: 1001 })).errores)).toEqual(['Cantidad: Debe ser un número de 1 a 1000']);
    expect(mensajes(interpretarEntregaEpp(fila({ ...base, motivo: 'Porque sí' })).errores)).toEqual([expect.stringMatching(/^Motivo: Debe ser una de estas opciones/)]);
  });
});

describe('interpretarAsistencia (RF-SST-23)', () => {
  const base: FilaLeida['celdas'] = { documento: '1000000001', tema: 'Trabajo seguro en alturas', fechaProgramada: '10/04/2026' };

  it('lee la fila con firma y calificación con coma decimal', () => {
    expect(interpretarAsistencia(fila({ ...base, firmo: 'Sí', calificacion: '4,5' })).datos).toEqual({ documento: '1000000001', tema: 'Trabajo seguro en alturas', fechaProgramada: '2026-04-10', firmo: true, calificacion: 4.5 });
    expect(interpretarAsistencia(fila(base)).datos).toMatchObject({ firmo: false, calificacion: undefined });
  });

  it('la calificación va de 0 a 5', () => {
    expect(mensajes(interpretarAsistencia(fila({ ...base, calificacion: 6 })).errores)).toEqual(['Calificación: Debe estar entre 0 y 5']);
    expect(interpretarAsistencia(fila({ ...base, calificacion: 0 })).datos?.calificacion).toBe(0);
  });
});
