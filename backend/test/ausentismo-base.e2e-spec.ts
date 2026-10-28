// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
// Fijan las reglas que la base de datos exige por sí sola en el ausentismo (CC-03, fase C: RF-SST-01 a 03, 06, 08 y 09).
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');

describe('Ausentismo contra Postgres real: reglas de la base', () => {
  const prisma = new PrismaService();
  let usuarioId: string;
  let tipoGeneralId: string;
  let tipoLutoId: string;
  let diagnosticoId: string;

  beforeAll(async () => {
    await prisma.$connect();
    usuarioId = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
    tipoGeneralId = (await prisma.tipoAusentismo.findUniqueOrThrow({ where: { codigo: 'ENFERMEDAD_GENERAL' } })).id;
    tipoLutoId = (await prisma.tipoAusentismo.findUniqueOrThrow({ where: { codigo: 'LUTO' } })).id;
    diagnosticoId = (await prisma.diagnosticoCie10.findUniqueOrThrow({ where: { codigo: 'J06.9' } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

  async function enTransaccionRevertida(prueba: (tx: Tx) => Promise<void>) {
    await expect(
      prisma.$transaction(async (tx) => {
        await prueba(tx);
        throw REVERTIR;
      }),
    ).rejects.toBe(REVERTIR);
  }

  // Dentro de una transacción, un error de Postgres la aborta: cada rechazo va en su propio punto de guardado.
  let contadorPuntos = 0;
  async function rechaza(tx: Tx, operacion: () => Promise<unknown>, esperado: RegExp) {
    const punto = `p${++contadorPuntos}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
    await expect(operacion()).rejects.toThrow(esperado);
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
  }

  const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes);

  async function trabajadorDePrueba(tx: Tx) {
    return tx.trabajador.create({ data: { nombre: 'Persona Inventada', documento: `AUS-${randomUUID()}`, cargo: 'Oficial', salarioBase: '1750905', fechaIngreso: dia(1, 1) } });
  }

  // Un ausentismo con lo mínimo; cada prueba cambia lo que le interesa.
  function datos(trabajadorId: string, extra: Record<string, unknown> = {}) {
    return {
      trabajadorId,
      tipoId: tipoGeneralId,
      fechaInicio: dia(3, 10),
      fechaFin: dia(3, 14),
      dias: 5,
      anio: 2026,
      mes: 3,
      diagnosticoId,
      cargoFoto: 'Oficial',
      salarioFoto: '1750905',
      baseDiaria: '58363.50',
      pisoDiario: '58363.50',
      parametrosLiquidacion: {},
      liquidacionCalculada: {},
      registradaPorId: usuarioId,
      ...extra,
    } as never;
  }

  describe('catálogos sembrados', () => {
    it('los 9 tipos del libro traen su regla y su porcentaje', async () => {
      const tipos = await prisma.tipoAusentismo.findMany({ orderBy: { orden: 'asc' } });
      expect(tipos.map((t) => t.codigo)).toEqual([
        'ENFERMEDAD_GENERAL',
        'ACCIDENTE_TRABAJO',
        'ENFERMEDAD_LABORAL',
        'LICENCIA_MATERNIDAD_PATERNIDAD',
        'LUTO',
        'CALAMIDAD',
        'PERMISO_REMUNERADO',
        'LICENCIA_NO_REMUNERADA',
        'AUSENCIA_INJUSTIFICADA',
      ]);
      const porCodigo = Object.fromEntries(tipos.map((t) => [t.codigo, t]));
      expect(porCodigo.ENFERMEDAD_GENERAL).toMatchObject({ regla: 'INCAPACIDAD_GENERAL', requiereDiagnostico: true, porcentaje: null });
      expect(porCodigo.ACCIDENTE_TRABAJO).toMatchObject({ regla: 'ORIGEN_LABORAL', diaEventoComoLaborado: true });
      expect(porCodigo.ENFERMEDAD_LABORAL).toMatchObject({ regla: 'ORIGEN_LABORAL', diaEventoComoLaborado: false });
      expect(porCodigo.LICENCIA_MATERNIDAD_PATERNIDAD).toMatchObject({ regla: 'PAGA_EPS' });
      expect(porCodigo.LUTO).toMatchObject({ regla: 'PAGA_EMPLEADOR' });
      expect(porCodigo.LICENCIA_NO_REMUNERADA).toMatchObject({ regla: 'DESCUENTO' });
    });

    it('el catálogo de CIE-10 trae códigos de referencia con la forma correcta', async () => {
      const codigos = await prisma.diagnosticoCie10.findMany({ select: { codigo: true } });
      expect(codigos.length).toBeGreaterThanOrEqual(100);
      for (const { codigo } of codigos) {
        expect(codigo).toMatch(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/);
      }
    });
  });

  describe('registro de un ausentismo (RF-SST-01 a 03)', () => {
    it('guarda uno válido y rechaza fechas desordenadas, días que no cuadran y mes o año que no corresponden', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        await tx.ausentismo.create({ data: datos(trabajador.id) });
        await rechaza(tx, () => tx.ausentismo.create({ data: datos(trabajador.id, { fechaInicio: dia(4, 5), fechaFin: dia(4, 1), dias: 1, mes: 4 }) }), /fechas_en_orden|dias_cuadran/);
        await rechaza(tx, () => tx.ausentismo.create({ data: datos(trabajador.id, { fechaInicio: dia(4, 1), fechaFin: dia(4, 3), dias: 9, mes: 4 }) }), /dias_cuadran/);
        await rechaza(tx, () => tx.ausentismo.create({ data: datos(trabajador.id, { fechaInicio: dia(5, 1), fechaFin: dia(5, 2), dias: 2, mes: 6 }) }), /anio_mes_validos/);
      });
    });

    it('una incapacidad exige el diagnóstico y una licencia no', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        await rechaza(tx, () => tx.ausentismo.create({ data: datos(trabajador.id, { diagnosticoId: null }) }), /exige el diagnóstico/);
        await tx.ausentismo.create({ data: datos(trabajador.id, { tipoId: tipoLutoId, diagnosticoId: null, fechaInicio: dia(6, 1), fechaFin: dia(6, 3), dias: 3, mes: 6 }) });
      });
    });

    it('no admite dos ausentismos vigentes que se traslapen, pero uno anulado libera las fechas', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const primero = await tx.ausentismo.create({ data: datos(trabajador.id) });
        await rechaza(tx, () => tx.ausentismo.create({ data: datos(trabajador.id, { fechaInicio: dia(3, 14), fechaFin: dia(3, 16), dias: 3 }) }), /ya tiene un ausentismo en esas fechas/);
        // Otro trabajador sí puede tener las mismas fechas.
        const otro = await trabajadorDePrueba(tx);
        await tx.ausentismo.create({ data: datos(otro.id) });
        await tx.ausentismo.update({ where: { id: primero.id }, data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuarioId, motivoAnulacion: 'Registrado por error' } });
        await tx.ausentismo.create({ data: datos(trabajador.id, { fechaInicio: dia(3, 12), fechaFin: dia(3, 13), dias: 2 }) });
      });
    });

    it('la prórroga continúa un ausentismo del mismo trabajador y trae los días previos', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const otro = await trabajadorDePrueba(tx);
        const primero = await tx.ausentismo.create({ data: datos(trabajador.id) });
        const ajeno = await tx.ausentismo.create({ data: datos(otro.id) });
        await tx.ausentismo.create({ data: datos(trabajador.id, { fechaInicio: dia(3, 15), fechaFin: dia(3, 20), dias: 6, esProrroga: true, prorrogaDeId: primero.id, diasPrevios: 5 }) });
        // Sin marcarla como prórroga, con días previos sin serlo, o continuando la de otra persona: no.
        await rechaza(tx, () => tx.ausentismo.create({ data: datos(trabajador.id, { fechaInicio: dia(4, 1), fechaFin: dia(4, 2), dias: 2, mes: 4, prorrogaDeId: primero.id }) }), /prorroga_coherente/);
        await rechaza(tx, () => tx.ausentismo.create({ data: datos(trabajador.id, { fechaInicio: dia(4, 1), fechaFin: dia(4, 2), dias: 2, mes: 4, diasPrevios: 3 }) }), /prorroga_coherente/);
        await rechaza(tx, () => tx.ausentismo.create({ data: datos(trabajador.id, { fechaInicio: dia(4, 1), fechaFin: dia(4, 2), dias: 2, mes: 4, esProrroga: true, prorrogaDeId: ajeno.id }) }), /del mismo trabajador/);
      });
    });
  });

  describe('un ausentismo no se edita ni se borra', () => {
    it('no cambia el trabajador, el tipo, las fechas ni la foto; sí el número, el diagnóstico y las observaciones', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const a = await tx.ausentismo.create({ data: datos(trabajador.id) });
        await rechaza(tx, () => tx.ausentismo.update({ where: { id: a.id }, data: { fechaFin: dia(3, 15), dias: 6 } }), /no se puede editar/);
        await rechaza(tx, () => tx.ausentismo.update({ where: { id: a.id }, data: { tipoId: tipoLutoId } }), /no se puede editar/);
        await rechaza(tx, () => tx.ausentismo.update({ where: { id: a.id }, data: { salarioFoto: '9999999' } }), /no se puede editar/);
        await rechaza(tx, () => tx.ausentismo.update({ where: { id: a.id }, data: { liquidacionCalculada: { valor: 1 } } }), /no se puede editar/);
        const editado = await tx.ausentismo.update({ where: { id: a.id }, data: { numeroDocumento: 'INC-0001', observaciones: 'Reposo en casa' } });
        expect(editado).toMatchObject({ numeroDocumento: 'INC-0001', observaciones: 'Reposo en casa' });
        // Una incapacidad no puede quedarse sin diagnóstico después.
        await rechaza(tx, () => tx.ausentismo.update({ where: { id: a.id }, data: { diagnosticoId: null } }), /exige el diagnóstico/);
      });
    });

    it('no se borra, ni siquiera directamente en la base', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const a = await tx.ausentismo.create({ data: datos(trabajador.id) });
        await rechaza(tx, () => tx.ausentismo.delete({ where: { id: a.id } }), /no se borran/);
      });
    });

    it('anular exige fecha, quién y motivo; uno anulado ya no cambia', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const a = await tx.ausentismo.create({ data: datos(trabajador.id) });
        await rechaza(tx, () => tx.ausentismo.update({ where: { id: a.id }, data: { anulada: true } }), /anulacion_completa/);
        await tx.ausentismo.update({ where: { id: a.id }, data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuarioId, motivoAnulacion: 'Registrada por error' } });
        await rechaza(tx, () => tx.ausentismo.update({ where: { id: a.id }, data: { observaciones: 'x' } }), /anulado no se puede modificar/);
      });
    });

    it('la corrección de la liquidación exige motivo y no se deshace', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const a = await tx.ausentismo.create({ data: datos(trabajador.id) });
        await rechaza(tx, () => tx.ausentismo.update({ where: { id: a.id }, data: { corregida: true } }), /correccion_completa/);
        await tx.ausentismo.update({ where: { id: a.id }, data: { corregida: true, corregidaEn: new Date(), corregidaPorId: usuarioId, motivoCorreccion: 'La EPS pagó otro valor' } });
        await rechaza(tx, () => tx.ausentismo.update({ where: { id: a.id }, data: { corregida: false, corregidaEn: null, corregidaPorId: null, motivoCorreccion: null } }), /no se puede deshacer/);
      });
    });
  });

  describe('períodos del ausentismo (RF-SST-06 y 08)', () => {
    it('los días de los pagadores deben sumar el total; mes y total no cambian pero los valores sí', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const a = await tx.ausentismo.create({ data: datos(trabajador.id) });
        const periodo = await tx.ausentismoPeriodo.create({ data: { ausentismoId: a.id, anio: 2026, mes: 3, dias: 5, diasEmpleador: 2, diasEps: 3, valorEmpleador: '116727', valorEps: '175090' } });
        await rechaza(tx, () => tx.ausentismoPeriodo.create({ data: { ausentismoId: a.id, anio: 2026, mes: 4, dias: 5, diasEmpleador: 2 } }), /dias_validos/);
        await rechaza(tx, () => tx.ausentismoPeriodo.create({ data: { ausentismoId: a.id, anio: 2026, mes: 3, dias: 5, diasEmpleador: 5 } }), /Unique|unique/);
        await rechaza(tx, () => tx.ausentismoPeriodo.create({ data: { ausentismoId: a.id, anio: 2026, mes: 13, dias: 1, diasEmpleador: 1 } }), /mes_valido/);
        await rechaza(tx, () => tx.ausentismoPeriodo.update({ where: { id: periodo.id }, data: { dias: 9 } }), /no se pueden cambiar/);
        await rechaza(tx, () => tx.ausentismoPeriodo.update({ where: { id: periodo.id }, data: { valorEps: '-1' } }), /valores_validos/);
        const corregido = await tx.ausentismoPeriodo.update({ where: { id: periodo.id }, data: { valorEps: '180000' } });
        expect(corregido.valorEps.toString()).toBe('180000');
        await rechaza(tx, () => tx.ausentismoPeriodo.delete({ where: { id: periodo.id } }), /no se borran/);
      });
    });

    it('un ausentismo anulado ya no cambia sus períodos', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const a = await tx.ausentismo.create({ data: datos(trabajador.id) });
        const periodo = await tx.ausentismoPeriodo.create({ data: { ausentismoId: a.id, anio: 2026, mes: 3, dias: 5, diasEmpleador: 5 } });
        await tx.ausentismo.update({ where: { id: a.id }, data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuarioId, motivoAnulacion: 'Registrada por error' } });
        await rechaza(tx, () => tx.ausentismoPeriodo.update({ where: { id: periodo.id }, data: { valorEmpleador: '1' } }), /anulado no se puede modificar/);
      });
    });
  });

  describe('recobro de una incapacidad (RF-SST-09)', () => {
    it('cada estado exige sus datos y no se cambia la entidad', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const a = await tx.ausentismo.create({ data: datos(trabajador.id) });
        const recobro = await tx.recobroAusentismo.create({ data: { ausentismoId: a.id, entidad: 'EPS' } });
        await rechaza(tx, () => tx.recobroAusentismo.create({ data: { ausentismoId: a.id, entidad: 'EPS' } }), /Unique|unique/);
        await rechaza(tx, () => tx.recobroAusentismo.update({ where: { id: recobro.id }, data: { estado: 'RADICADA' } }), /estado_coherente/);
        await tx.recobroAusentismo.update({ where: { id: recobro.id }, data: { estado: 'RADICADA', fechaRadicacion: dia(4, 1) } });
        await rechaza(tx, () => tx.recobroAusentismo.update({ where: { id: recobro.id }, data: { estado: 'PAGADA', fechaPago: dia(4, 20) } }), /estado_coherente/);
        await rechaza(tx, () => tx.recobroAusentismo.update({ where: { id: recobro.id }, data: { estado: 'PAGADA', fechaPago: dia(3, 20), valorReconocido: '175090' } }), /estado_coherente/);
        await tx.recobroAusentismo.update({ where: { id: recobro.id }, data: { estado: 'PAGADA', fechaPago: dia(4, 20), valorReconocido: '175090' } });
        await rechaza(tx, () => tx.recobroAusentismo.update({ where: { id: recobro.id }, data: { estado: 'RECHAZADA', fechaPago: null } }), /estado_coherente/);
        await rechaza(tx, () => tx.recobroAusentismo.update({ where: { id: recobro.id }, data: { entidad: 'ARL' } }), /no se pueden cambiar/);
        await rechaza(tx, () => tx.recobroAusentismo.delete({ where: { id: recobro.id } }), /no se borran/);
      });
    });
  });

  describe('catálogos', () => {
    it('la clave y la regla de un tipo no cambian, el porcentaje es de 0 a 100 y no se borra', async () => {
      await enTransaccionRevertida(async (tx) => {
        await rechaza(tx, () => tx.tipoAusentismo.update({ where: { id: tipoLutoId }, data: { regla: 'DESCUENTO' } }), /no se pueden cambiar/);
        await rechaza(tx, () => tx.tipoAusentismo.update({ where: { id: tipoLutoId }, data: { codigo: 'OTRO' } }), /no se pueden cambiar/);
        await rechaza(tx, () => tx.tipoAusentismo.update({ where: { id: tipoLutoId }, data: { porcentaje: '150' } }), /porcentaje_segun_regla/);
        await rechaza(tx, () => tx.tipoAusentismo.update({ where: { id: tipoGeneralId }, data: { porcentaje: '50' } }), /porcentaje_segun_regla/);
        await rechaza(tx, () => tx.tipoAusentismo.update({ where: { id: tipoGeneralId }, data: { diaEventoComoLaborado: true } }), /dia_evento_solo_laboral/);
        await tx.tipoAusentismo.update({ where: { id: tipoLutoId }, data: { porcentaje: '80' } });
        await rechaza(tx, () => tx.tipoAusentismo.delete({ where: { id: tipoLutoId } }), /no se borran/);
      });
    });

    it('el código CIE-10 tiene la forma correcta, no cambia y el diagnóstico no se borra', async () => {
      await enTransaccionRevertida(async (tx) => {
        await rechaza(tx, () => tx.diagnosticoCie10.create({ data: { codigo: 'jj06', descripcion: 'Mal escrito' } }), /codigo_valido/);
        await rechaza(tx, () => tx.diagnosticoCie10.update({ where: { id: diagnosticoId }, data: { codigo: 'J06.8' } }), /no se puede cambiar/);
        await rechaza(tx, () => tx.diagnosticoCie10.delete({ where: { id: diagnosticoId } }), /no se borran/);
        const nuevo = await tx.diagnosticoCie10.create({ data: { codigo: 'Z99.9', descripcion: 'Código de prueba' } });
        expect(nuevo.activo).toBe(true);
      });
    });
  });

  describe('adjuntos', () => {
    it('el certificado pertenece a un solo registro: el ausentismo, y no a dos a la vez', async () => {
      await enTransaccionRevertida(async (tx) => {
        const trabajador = await trabajadorDePrueba(tx);
        const a = await tx.ausentismo.create({ data: datos(trabajador.id) });
        const base = { nombreOriginal: 'certificado.pdf', ruta: 'ausentismo/x.pdf', tipoMime: 'application/pdf', tamano: 1000, subidoPorId: usuarioId };
        const documento = await tx.documentoSst.create({ data: { ...base, ausentismoId: a.id } });
        expect(documento.ausentismoId).toBe(a.id);
        const capacitacion = await tx.capacitacion.create({
          data: {
            tema: 'Tema de prueba',
            objetivo: 'Objetivo de prueba',
            dirigidoA: 'Todos',
            modalidad: 'PRESENCIAL',
            horas: 1,
            fechaProgramada: dia(7, 1),
            responsable: 'Responsable',
            correoResponsable: 'responsable@ejemplo.test',
            ejecutor: 'INTERNO',
            asistentesProgramados: 1,
            creadaPorId: usuarioId,
          },
        });
        await rechaza(tx, () => tx.documentoSst.create({ data: { ...base, ausentismoId: a.id, capacitacionId: capacitacion.id } }), /un_solo_dueno/);
        await rechaza(tx, () => tx.documentoSst.create({ data: { ...base } }), /un_solo_dueno/);
      });
    });
  });
});
