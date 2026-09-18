import { describe, expect, it } from 'vitest';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { necesitaRecordatorio } from './recordatorio.js';

const HOY = new Date(2026, 8, 18); // 18 de septiembre de 2026

describe('necesitaRecordatorio', () => {
  it('no avisa si la cuota ya está PAGADA', () => {
    expect(
      necesitaRecordatorio(
        { estado: EstadoCuota.PAGADA, fechaVencimiento: new Date(2026, 8, 20), recordatorioEnviadoEn: null },
        3,
        HOY,
      ),
    ).toBe(false);
  });

  it('no avisa si ya se le envió un recordatorio a esta cuota', () => {
    expect(
      necesitaRecordatorio(
        {
          estado: EstadoCuota.PENDIENTE,
          fechaVencimiento: new Date(2026, 8, 20),
          recordatorioEnviadoEn: new Date(2026, 8, 17),
        },
        3,
        HOY,
      ),
    ).toBe(false);
  });

  it('avisa cuando faltan exactamente "diasAntes" días', () => {
    expect(
      necesitaRecordatorio(
        { estado: EstadoCuota.PENDIENTE, fechaVencimiento: new Date(2026, 8, 21), recordatorioEnviadoEn: null },
        3,
        HOY,
      ),
    ).toBe(true);
  });

  it('avisa el mismo día que vence', () => {
    expect(
      necesitaRecordatorio(
        { estado: EstadoCuota.PARCIAL, fechaVencimiento: new Date(2026, 8, 18), recordatorioEnviadoEn: null },
        3,
        HOY,
      ),
    ).toBe(true);
  });

  it('no avisa si falta más de "diasAntes" días', () => {
    expect(
      necesitaRecordatorio(
        { estado: EstadoCuota.PENDIENTE, fechaVencimiento: new Date(2026, 8, 25), recordatorioEnviadoEn: null },
        3,
        HOY,
      ),
    ).toBe(false);
  });

  it('no avisa si la cuota ya venció (eso es mora, no recordatorio)', () => {
    expect(
      necesitaRecordatorio(
        { estado: EstadoCuota.PENDIENTE, fechaVencimiento: new Date(2026, 8, 10), recordatorioEnviadoEn: null },
        3,
        HOY,
      ),
    ).toBe(false);
  });
});
