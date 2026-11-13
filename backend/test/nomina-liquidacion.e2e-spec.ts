// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
// Usan fechas de 2031 para no cruzarse con cierres de caja ni con pagos reales de la base de desarrollo.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UsuarioAutenticado } from '../src/auth/usuario-autenticado.js';
import type { LiquidarQuincenaDto } from '../src/nomina/dto/liquidar-quincena.dto.js';
import { filasDeNomina } from '../src/finanzas/proyecto-finanzas.js';
import { costoDelPago } from '../src/nomina/calculo-pago.js';
import { corregirPagoEnTx } from '../src/nomina/corregir-pago.js';
import { NominaService } from '../src/nomina/nomina.service.js';
import { liquidarQuincenaEnTx, prepararLiquidacion } from '../src/nomina/liquidar-quincena.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');

describe('Liquidación de nómina por obra contra Postgres real (CC-05, RF-PER-21 a RF-PER-23)', () => {
  const prisma = new PrismaService();
  let usuario: UsuarioAutenticado;

  beforeAll(async () => {
    await prisma.$connect();
    const real = await prisma.usuario.findFirstOrThrow({ select: { id: true, nombre: true, email: true } });
    usuario = { ...real, rol: { id: 'r', clave: 'GERENTE', nombre: 'Gerente' }, permisos: [], proyectoIds: null };
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

  async function escenario(tx: Tx) {
    const sufijo = randomUUID().slice(0, 8);
    const obraA = await tx.proyecto.create({ data: { nombre: `Obra A E2E ${sufijo}`, areaTotal: 1, tipo: 'REMODELACION' } });
    const obraB = await tx.proyecto.create({ data: { nombre: `Obra B E2E ${sufijo}`, areaTotal: 1, tipo: 'REMODELACION' } });
    const crear = (nombre: string, valorDia: number | null) =>
      tx.trabajador.create({ data: { nombre: `${nombre} ${sufijo}`, documento: `N-${nombre}-${sufijo}`, cargo: 'Auxiliar', salarioBase: 1_000_000, valorDia, fechaIngreso: new Date('2031-01-01') } });
    const ana = await crear('Ana', 60_000);
    const beto = await crear('Beto', 80_000);
    return { obraA, obraB, ana, beto };
  }

  const liquidacion = (proyectoId: string, pagos: LiquidarQuincenaDto['pagos'], cambios: Partial<LiquidarQuincenaDto> = {}): LiquidarQuincenaDto => ({
    proyectoId,
    periodoInicio: '2031-03-01',
    periodoFin: '2031-03-15',
    fechaPago: '2031-03-15',
    medioPago: 'EFECTIVO',
    pagos,
    ...cambios,
  });

  const ejecutar = (tx: Tx, dto: LiquidarQuincenaDto) => liquidarQuincenaEnTx(tx, prepararLiquidacion(dto, null), usuario);

  it('guarda el pago con la obra, los medios días, las horas extra, el devengado y la novedad de anticipo', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      const resultado = await ejecutar(
        tx,
        liquidacion(e.obraA.id, [
          { trabajadorId: e.ana.id, dias: '7.5', horasExtra: '3.5', valorHoraExtra: '9000', novedades: [{ tipo: 'ANTICIPO', valor: '100000' }], observaciones: 'Anticipo de la semana' },
          { trabajadorId: e.beto.id, dias: '15' },
        ]),
      );

      expect(resultado.totales.trabajadores).toBe(2);
      const guardado = await tx.pagoNomina.findUniqueOrThrow({ where: { id: resultado.pagos[0].id }, include: { novedades: true } });
      expect(guardado.proyectoId).toBe(e.obraA.id);
      expect(guardado.dias?.toString()).toBe('7.5');
      expect(guardado.valorDia?.toString()).toBe('60000');
      expect(guardado.salarioBase.toString()).toBe('450000');
      expect(guardado.horasExtra?.toString()).toBe('3.5');
      expect(guardado.valorHorasExtra?.toString()).toBe('31500'); // 3,5 x 9.000
      expect(guardado.valorDevengado?.toString()).toBe('481500');
      expect(guardado.valorPagado.toString()).toBe('381500'); // menos el anticipo
      expect(guardado.observaciones).toBe('Anticipo de la semana');
      expect(guardado.novedades.map((n) => n.tipo)).toEqual(['ANTICIPO']);
      expect(await tx.registroAuditoria.count({ where: { accion: 'NOMINA_REGISTRAR_PAGO', entidadId: { in: resultado.pagos.map((p) => p.id) } } })).toBe(2);
    });
  });

  it('un segundo pago del mismo trabajador en la misma obra y período se rechaza', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '10' }]));

      await expect(ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '5' }]))).rejects.toThrow(/Ya existe un pago/);
      expect(await tx.pagoNomina.count({ where: { trabajadorId: e.ana.id } })).toBe(1);
    });
  });

  it('la misma persona en dos obras del mismo período recibe dos pagos y se avisa si los días pasan del período', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      const primera = await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '9' }]));
      expect(primera.avisos).toEqual([]);

      // 9 + 8 = 17 días en un período de 15.
      const segunda = await ejecutar(tx, liquidacion(e.obraB.id, [{ trabajadorId: e.ana.id, dias: '8' }]));
      expect(segunda.avisos).toHaveLength(1);
      expect(segunda.avisos[0].mensaje).toMatch(/suma 17 días/);
      expect(await tx.pagoNomina.count({ where: { trabajadorId: e.ana.id } })).toBe(2);

      // El costo de cada obra sale de sus propios pagos (RF-PER-10).
      const porObra = await tx.pagoNomina.groupBy({ by: ['proyectoId'], where: { trabajadorId: e.ana.id }, _sum: { valorDevengado: true } });
      const suma = (id: string) => porObra.find((fila) => fila.proyectoId === id)?._sum.valorDevengado?.toString();
      expect(suma(e.obraA.id)).toBe('540000');
      expect(suma(e.obraB.id)).toBe('480000');
    });
  });

  it('el costo de cada obra sale de lo devengado, no de lo pagado, con los datos como los guarda la base (RF-PER-09 y RF-PER-10)', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      // Obra A: 10 días de Ana (600.000) con un anticipo de 100.000 -> se paga 500.000 pero la obra cuesta 600.000.
      await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '10', novedades: [{ tipo: 'ANTICIPO', valor: '100000' }] }, { trabajadorId: e.beto.id, dias: '5' }]));
      await ejecutar(tx, liquidacion(e.obraB.id, [{ trabajadorId: e.ana.id, dias: '3' }]));

      const pagosA = await tx.pagoNomina.findMany({ where: { proyectoId: e.obraA.id }, select: { periodoInicio: true, periodoFin: true, fechaPago: true, valorDevengado: true, valorPagado: true } });
      expect(pagosA.reduce((suma, p) => suma + Number(costoDelPago(p)), 0)).toBe(1_000_000); // 600.000 + 5 x 80.000
      expect(pagosA.reduce((suma, p) => suma + Number(p.valorPagado), 0)).toBe(900_000); // lo que sale de caja

      // En las finanzas de la obra, la nómina entra como UN gasto de la quincena, a su costo.
      const filas = filasDeNomina(pagosA);
      expect(filas).toHaveLength(1);
      expect(filas[0].valor.toString()).toBe('1000000');
      expect(filas[0].descripcion).toBe('Nómina del 01/03/2031 al 15/03/2031 · 2 trabajadores');

      const pagosB = await tx.pagoNomina.findMany({ where: { proyectoId: e.obraB.id }, select: { periodoInicio: true, periodoFin: true, fechaPago: true, valorDevengado: true, valorPagado: true } });
      expect(filasDeNomina(pagosB)[0].valor.toString()).toBe('180000');
    });
  });

  it('la quincena siguiente de la misma obra no choca con la anterior ni suma sus días', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '15' }]));
      const siguiente = await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '16' }], { periodoInicio: '2031-03-16', periodoFin: '2031-03-31', fechaPago: '2031-03-31' }));
      expect(siguiente.avisos).toEqual([]);
      expect(await tx.pagoNomina.count({ where: { trabajadorId: e.ana.id } })).toBe(2);
    });
  });

  it('usa el valor día de la ficha cuando no se escribe uno y respeta el que se escriba', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      const resultado = await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '10' }, { trabajadorId: e.beto.id, dias: '10', valorDia: '90000' }]));
      expect(resultado.pagos[0].valorDia.toString()).toBe('60000');
      expect(resultado.pagos[1].valorDia.toString()).toBe('90000');
      expect(resultado.avisos).toHaveLength(1); // Beto: 90.000 contra 80.000 de su ficha
    });
  });

  it('si un trabajador de la lista no tiene valor día, falla DESPUÉS de haber escrito el primero: por eso el servicio corre todo en una sola transacción', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      const sin = await tx.trabajador.create({ data: { nombre: `Sin valor ${randomUUID().slice(0, 6)}`, documento: `N-SV-${randomUUID().slice(0, 8)}`, cargo: 'Auxiliar', salarioBase: 1, fechaIngreso: new Date('2031-01-01') } });
      // El punto de guardado imita la transacción del servicio: al fallar, la base vuelve a como estaba.
      await tx.$executeRaw`SAVEPOINT liquidacion`;
      await expect(ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '10' }, { trabajadorId: sin.id, dias: '5' }]))).rejects.toThrow(/no tiene valor día/);
      expect(await tx.pagoNomina.count({ where: { trabajadorId: e.ana.id } })).toBe(1);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT liquidacion`;
      expect(await tx.pagoNomina.count({ where: { trabajadorId: e.ana.id } })).toBe(0);
    });
  });

  describe('corregir un pago ya liquidado y ver las liquidaciones (CC-09, RF-PER-26)', () => {
    const MOTIVO = 'Se digitaron mal los días de la quincena';

    it('corrige días y novedades en la base, recalcula, conserva el resto y deja la auditoría con el motivo', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        const resultado = await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '10', novedades: [{ tipo: 'ANTICIPO', valor: '100000' }], observaciones: 'Primera digitación' }]));
        const pagoId = resultado.pagos[0].id;

        const corregido = await corregirPagoEnTx(tx, pagoId, { motivo: MOTIVO, dias: '12', novedades: [{ tipo: 'DESCUENTO', valor: '50000', descripcion: 'préstamo' }] }, usuario);
        expect(corregido.pago.valorDevengado.toString()).toBe('720000');
        expect(corregido.pago.valorPagado.toString()).toBe('670000');

        const guardado = await tx.pagoNomina.findUniqueOrThrow({ where: { id: pagoId }, include: { novedades: true } });
        expect(guardado.dias?.toString()).toBe('12');
        expect(guardado.salarioBase.toString()).toBe('720000');
        expect(guardado.valorDevengado?.toString()).toBe('720000');
        expect(guardado.valorPagado.toString()).toBe('670000');
        expect(guardado.observaciones).toBe('Primera digitación'); // lo que no se envía no cambia
        expect(guardado.novedades.map((n) => [n.tipo, n.valor.toString(), n.descripcion])).toEqual([['DESCUENTO', '50000', 'préstamo']]); // el anticipo se reemplazó
        expect(guardado.proyectoId).toBe(e.obraA.id);

        const auditoria = await tx.registroAuditoria.findFirstOrThrow({ where: { accion: 'NOMINA_CORREGIR_PAGO', entidadId: pagoId } });
        expect(auditoria.resumen).toMatch(/devengado de \$600\.000 a \$720\.000/);
        expect(auditoria.antes).toMatchObject({ dias: '10', valorPagado: '500000' });
        expect(auditoria.despues).toMatchObject({ dias: '12', valorPagado: '670000', motivo: MOTIVO });
      });
    });

    it('el costo de la obra y el gasto de nómina de sus finanzas siguen lo corregido', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        const resultado = await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '10' }, { trabajadorId: e.beto.id, dias: '5' }]));
        await corregirPagoEnTx(tx, resultado.pagos[1].id, { motivo: MOTIVO, dias: '10' }, usuario);
        const pagos = await tx.pagoNomina.findMany({ where: { proyectoId: e.obraA.id }, select: { periodoInicio: true, periodoFin: true, fechaPago: true, valorDevengado: true, valorPagado: true } });
        expect(filasDeNomina(pagos)[0].valor.toString()).toBe('1400000'); // 600.000 + 10 x 80.000
      });
    });

    it('un pago corregido a un día en un cierre de caja cerrado se rechaza y no cambia nada', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        const resultado = await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '10' }]));
        const gerente = await tx.usuario.findFirstOrThrow({ select: { id: true } });
        await tx.cierreCaja.create({
          data: {
            tipo: 'SEMANAL',
            desde: new Date('2031-03-10T00:00:00.000Z'),
            hasta: new Date('2031-03-16T00:00:00.000Z'),
            efectivoInicial: 0,
            estado: 'CERRADO',
            numero: 999_001,
            numeroTexto: 'PRUEBA-NOMINA-999001',
            efectivoEsperado: 0,
            efectivoContado: 0,
            diferencia: 0,
            contenido: { prueba: true },
            creadoPorId: gerente.id,
            cerradoPorId: gerente.id,
            cerradoEn: new Date(),
          },
        });
        await expect(corregirPagoEnTx(tx, resultado.pagos[0].id, { motivo: MOTIVO, dias: '12' }, usuario)).rejects.toThrow(/cierre de caja/);
        expect((await tx.pagoNomina.findUniqueOrThrow({ where: { id: resultado.pagos[0].id } })).dias?.toString()).toBe('10');
      });
    });

    it('la lista de liquidaciones agrupa por obra y quincena con sus totales, y se puede filtrar por obra', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '10' }, { trabajadorId: e.beto.id, dias: '5', novedades: [{ tipo: 'ANTICIPO', valor: '50000' }] }]));
        await ejecutar(tx, liquidacion(e.obraB.id, [{ trabajadorId: e.ana.id, dias: '3' }]));
        await ejecutar(tx, liquidacion(e.obraA.id, [{ trabajadorId: e.ana.id, dias: '12' }], { periodoInicio: '2031-03-16', periodoFin: '2031-03-31', fechaPago: '2031-03-31' }));

        const servicio = new NominaService(tx as never, {} as never);
        const deObraA = await servicio.listarLiquidaciones({ proyectoId: e.obraA.id });
        expect(deObraA).toHaveLength(2);
        // Lo más reciente primero: la segunda quincena, luego la primera.
        expect(deObraA[0]).toMatchObject({ trabajadores: 1 });
        expect(deObraA[0].devengado.toString()).toBe('720000');
        expect(deObraA[1]).toMatchObject({ trabajadores: 2, proyecto: { id: e.obraA.id } });
        expect(deObraA[1].devengado.toString()).toBe('1000000'); // 600.000 + 5 x 80.000
        expect(deObraA[1].pagado.toString()).toBe('950000'); // menos el anticipo de 50.000

        const deObraB = await servicio.listarLiquidaciones({ proyectoId: e.obraB.id });
        expect(deObraB).toHaveLength(1);
        expect(deObraB[0].proyecto.nombre).toMatch(/Obra B E2E/);
      });
    });
  });
});
