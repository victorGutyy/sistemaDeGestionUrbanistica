// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SeguridadSocialService } from '../src/seguridad-social/seguridad-social.service.js';
import type { UsuarioAutenticado } from '../src/auth/usuario-autenticado.js';

const REVERTIR = new Error('revertir');

describe('Seguridad social contra Postgres real (RF-CFG-13, RF-CFG-14, RF-PER-04)', () => {
  const prisma = new PrismaService();
  let usuario: UsuarioAutenticado;

  beforeAll(async () => {
    await prisma.$connect();
    const fila = await prisma.usuario.findFirstOrThrow({ include: { rol: true } });
    usuario = {
      id: fila.id,
      email: fila.email,
      nombre: fila.nombre,
      rol: { id: fila.rol.id, clave: fila.rol.clave, nombre: fila.rol.nombre },
      permisos: fila.rol.permisos,
      proyectoIds: null,
    };
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

  // El servicio abre su propia transacción: aquí "abre" la de la prueba, así lo que escribe se revierte al final.
  const servicioEn = (tx: Tx) => new SeguridadSocialService(new Proxy(tx, { get: (objetivo, clave) => (clave === '$transaction' ? (accion: (t: Tx) => unknown) => accion(objetivo) : Reflect.get(objetivo, clave)) }) as unknown as PrismaService);

  async function trabajadorDePrueba(tx: Tx) {
    return tx.trabajador.create({ data: { nombre: 'Persona Inventada', documento: `E2E-${randomUUID().slice(0, 8)}`, cargo: 'Oficial', salarioBase: 1_500_000, fechaIngreso: new Date(2026, 0, 1) } });
  }

  const NUEVO = {
    anio: 2099,
    smmlv: '2000000',
    auxilioTransporte: '300000',
    porcentajeIncapacidadTramo1: 66.67,
    porcentajeIncapacidadTramo2: 50,
    porcentajeIncapacidadLaboral: 100,
    diasEmpleador: 2,
    diasTramo1Hasta: 90,
    diasTramo2Hasta: 180,
  };

  it('la semilla dejó las cinco clases de riesgo, entidades de cada tipo y los parámetros de 2026 sin validar', async () => {
    expect((await prisma.claseRiesgoArl.findMany({ orderBy: { clase: 'asc' } })).map((c) => c.clase)).toEqual([1, 2, 3, 4, 5]);
    for (const tipo of ['EPS', 'AFP', 'CESANTIAS', 'ARL', 'CAJA'] as const) {
      expect(await prisma.entidadSS.count({ where: { tipo } }), tipo).toBeGreaterThan(0);
    }
    const parametro2026 = await prisma.parametroLegal.findUniqueOrThrow({ where: { anio: 2026 } });
    expect(parametro2026.validadoEn).toBeNull();
    expect(parametro2026.diasBaseMes).toBe(30);
  });

  it('crear, editar y validar un año: la validación se pierde si cambia un valor legal, y todo queda auditado', async () => {
    await enTransaccionRevertida(async (tx) => {
      const servicio = servicioEn(tx);
      const creado = await servicio.crearParametro(NUEVO, usuario);
      expect(creado.validadoEn).toBeNull();

      await expect(servicio.crearParametro(NUEVO, usuario)).rejects.toBeInstanceOf(ConflictException);

      const validado = await servicio.validarParametro(creado.id, usuario);
      expect(validado.validadoPorId).toBe(usuario.id);

      const editado = await servicio.actualizarParametro(creado.id, { smmlv: '2100000' }, usuario);
      expect(editado.validadoEn).toBeNull();
      expect(editado.validadoPorId).toBeNull();
      expect(editado.smmlv.toString()).toBe('2100000');

      const acciones = (await tx.registroAuditoria.findMany({ where: { entidadId: creado.id }, orderBy: { createdAt: 'asc' } })).map((r) => r.accion);
      expect(acciones).toEqual(['PARAMETRO_LEGAL_CREAR', 'PARAMETRO_LEGAL_VALIDAR', 'PARAMETRO_LEGAL_EDITAR']);
    });
  });

  it('un parámetro legal, una entidad y una clase de riesgo no se borran, ni con acceso directo a la base', async () => {
    await enTransaccionRevertida(async (tx) => {
      const parametro = await tx.parametroLegal.findUniqueOrThrow({ where: { anio: 2026 } });
      await expect(tx.$executeRaw`DELETE FROM "ParametroLegal" WHERE "id" = ${parametro.id}`).rejects.toThrow(/no se borran/);
    });
    await enTransaccionRevertida(async (tx) => {
      const entidad = await tx.entidadSS.findFirstOrThrow();
      await expect(tx.$executeRaw`DELETE FROM "EntidadSS" WHERE "id" = ${entidad.id}`).rejects.toThrow(/no se borran/);
    });
    await enTransaccionRevertida(async (tx) => {
      const clase = await tx.claseRiesgoArl.findFirstOrThrow();
      await expect(tx.$executeRaw`DELETE FROM "ClaseRiesgoArl" WHERE "id" = ${clase.id}`).rejects.toThrow(/no se borran/);
    });
  });

  it('la base rechaza parámetros con tramos desordenados, porcentajes fuera de rango o validación a medias', async () => {
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.parametroLegal.create({ data: { ...NUEVO, smmlv: 2_000_000, auxilioTransporte: 300_000, diasTramo1Hasta: 200 } })).rejects.toThrow(/tramos_en_orden/);
    });
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.parametroLegal.create({ data: { ...NUEVO, smmlv: 2_000_000, auxilioTransporte: 300_000, porcentajeIncapacidadTramo1: 150 } })).rejects.toThrow(/porcentajes_validos/);
    });
    await enTransaccionRevertida(async (tx) => {
      const parametro = await tx.parametroLegal.findUniqueOrThrow({ where: { anio: 2026 } });
      await expect(tx.$executeRaw`UPDATE "ParametroLegal" SET "validadoEn" = now() WHERE "id" = ${parametro.id}`).rejects.toThrow(/validacion_completa/);
    });
  });

  it('una afiliación: una sola vigente por tipo, la entidad debe ser del tipo y la clase de riesgo solo va en la ARL', async () => {
    await enTransaccionRevertida(async (tx) => {
      const trabajador = await trabajadorDePrueba(tx);
      const eps = await tx.entidadSS.findFirstOrThrow({ where: { tipo: 'EPS' } });
      const afp = await tx.entidadSS.findFirstOrThrow({ where: { tipo: 'AFP' } });
      const arl = await tx.entidadSS.findFirstOrThrow({ where: { tipo: 'ARL' } });
      const clase = await tx.claseRiesgoArl.findUniqueOrThrow({ where: { clase: 3 } });
      const base = { trabajadorId: trabajador.id, fechaInicio: new Date(2026, 0, 1), registradaPorId: usuario.id };

      await tx.afiliacionTrabajador.create({ data: { ...base, tipo: 'EPS', entidadId: eps.id } });
      // Dentro de una transacción, un error de Postgres la aborta: cada rechazo va en su propio punto de guardado.
      const rechaza = async (nombre: string, datos: Parameters<Tx['afiliacionTrabajador']['create']>[0]['data'], esperado: RegExp) => {
        await tx.$executeRawUnsafe(`SAVEPOINT ${nombre}`);
        await expect(tx.afiliacionTrabajador.create({ data: datos }), nombre).rejects.toThrow(esperado);
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${nombre}`);
      };

      await rechaza('segunda_eps', { ...base, tipo: 'EPS', entidadId: eps.id }, /una_vigente_por_tipo|Unique constraint/);
      await rechaza('entidad_de_otro_tipo', { ...base, tipo: 'AFP', entidadId: eps.id }, /no es del tipo/);
      await rechaza('arl_sin_clase', { ...base, tipo: 'ARL', entidadId: arl.id }, /clase_solo_en_arl/);
      await rechaza('clase_en_afp', { ...base, tipo: 'AFP', entidadId: afp.id, claseRiesgoId: clase.id }, /clase_solo_en_arl/);
      await rechaza('fin_antes_del_inicio', { ...base, tipo: 'AFP', entidadId: afp.id, fechaFin: new Date(2025, 0, 1) }, /fechas_en_orden/);

      // Cambiar de EPS: se cierra la vigente y se abre la nueva.
      await tx.afiliacionTrabajador.updateMany({ where: { trabajadorId: trabajador.id, tipo: 'EPS', fechaFin: null }, data: { fechaFin: new Date(2026, 5, 30) } });
      const otraEps = await tx.entidadSS.findFirstOrThrow({ where: { tipo: 'EPS', id: { not: eps.id } } });
      await tx.afiliacionTrabajador.create({ data: { ...base, fechaInicio: new Date(2026, 6, 1), tipo: 'EPS', entidadId: otraEps.id } });
      expect(await tx.afiliacionTrabajador.count({ where: { trabajadorId: trabajador.id, tipo: 'EPS' } })).toBe(2);

      // La ARL con su clase sí se acepta.
      await tx.afiliacionTrabajador.create({ data: { ...base, tipo: 'ARL', entidadId: arl.id, claseRiesgoId: clase.id } });
    });
  });

  it('una afiliación y un documento del trabajador no se borran', async () => {
    await enTransaccionRevertida(async (tx) => {
      const trabajador = await trabajadorDePrueba(tx);
      const eps = await tx.entidadSS.findFirstOrThrow({ where: { tipo: 'EPS' } });
      const afiliacion = await tx.afiliacionTrabajador.create({ data: { trabajadorId: trabajador.id, tipo: 'EPS', entidadId: eps.id, fechaInicio: new Date(2026, 0, 1), registradaPorId: usuario.id } });
      await expect(tx.$executeRaw`DELETE FROM "AfiliacionTrabajador" WHERE "id" = ${afiliacion.id}`).rejects.toThrow(/no se borran/);
    });
    await enTransaccionRevertida(async (tx) => {
      const trabajador = await trabajadorDePrueba(tx);
      const documento = await tx.documentoTrabajador.create({
        data: { trabajadorId: trabajador.id, tipo: 'CERTIFICADO_AFILIACION', nombreOriginal: 'certificado.pdf', ruta: 'trabajadores/prueba.pdf', tipoMime: 'application/pdf', tamano: 1234, subidoPorId: usuario.id },
      });
      await expect(tx.$executeRaw`DELETE FROM "DocumentoTrabajador" WHERE "id" = ${documento.id}`).rejects.toThrow(/no se borran/);
    });
  });

  it('la ficha del trabajador: el retiro lleva fecha y motivo, y la autorización de datos de salud lleva fecha y responsable', async () => {
    await enTransaccionRevertida(async (tx) => {
      const trabajador = await trabajadorDePrueba(tx);
      expect(trabajador).toMatchObject({ tipoDocumento: 'CC', tipoContrato: 'OBRA_LABOR', autorizaDatosSalud: false, fechaRetiro: null });
      await expect(tx.$executeRaw`UPDATE "Trabajador" SET "fechaRetiro" = now() WHERE "id" = ${trabajador.id}`).rejects.toThrow(/retiro_completo/);
    });
    await enTransaccionRevertida(async (tx) => {
      const trabajador = await trabajadorDePrueba(tx);
      await expect(tx.$executeRaw`UPDATE "Trabajador" SET "autorizaDatosSalud" = true WHERE "id" = ${trabajador.id}`).rejects.toThrow(/autorizacion_salud_completa/);
    });
  });

  it('los diagnósticos los tienen solo el gerente y el contratista SST; los valores, el gerente y el administrador', async () => {
    const roles = await prisma.rolUsuario.findMany({ select: { clave: true, permisos: true } });
    const quienTiene = (permiso: string) => roles.filter((r) => r.permisos.includes(permiso)).map((r) => r.clave).sort();
    expect(quienTiene('sst.diagnosticos_ver')).toEqual(['CONTRATISTA_SST', 'GERENTE']);
    expect(quienTiene('sst.valores_ver')).toEqual(['ADMINISTRADOR', 'GERENTE']);
    expect(quienTiene('sst.ver')).toEqual(['ADMINISTRADOR', 'CONTRATISTA_SST', 'GERENTE']);
  });
});
