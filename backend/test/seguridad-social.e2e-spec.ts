// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SeguridadSocialService } from '../src/seguridad-social/seguridad-social.service.js';
import type { UsuarioAutenticado } from '../src/auth/usuario-autenticado.js';
import type { StorageService } from '../src/storage/storage.service.js';
import { AfiliacionesTrabajadorService } from '../src/trabajadores/afiliaciones-trabajador.service.js';
import { DocumentosTrabajadorService } from '../src/trabajadores/documentos-trabajador.service.js';
import { TrabajadoresService } from '../src/trabajadores/trabajadores.service.js';

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

  it('recorrido completo con los servicios reales: crear, afiliar, cambiar de EPS, ARL con clase, certificado, alertas, autorización y retiro', async () => {
    await enTransaccionRevertida(async (tx) => {
      const proxy = new Proxy(tx, { get: (objetivo, clave) => (clave === '$transaction' ? (accion: (t: Tx) => unknown) => accion(objetivo) : Reflect.get(objetivo, clave)) }) as unknown as PrismaService;
      const archivos = new Map<string, Buffer>();
      const almacenamiento = {
        guardar: (carpeta: string, nombre: string, buffer: Buffer) => {
          const rutaRelativa = `${carpeta}/${nombre}`;
          archivos.set(rutaRelativa, buffer);
          return Promise.resolve({ rutaRelativa });
        },
        leer: (ruta: string) => Promise.resolve(archivos.get(ruta) ?? Buffer.alloc(0)),
      } as unknown as StorageService;
      const trabajadores = new TrabajadoresService(proxy);
      const afiliaciones = new AfiliacionesTrabajadorService(proxy);
      const documentos = new DocumentosTrabajadorService(proxy, almacenamiento);
      const gerente = { ...usuario, permisos: ['nomina.ver', 'nomina.gestionar', 'sst.ver', 'sst.gestionar'] };

      const creado = await trabajadores.crear(
        { nombres: 'Persona', apellidos: 'Inventada E2E', documento: `E2E-${randomUUID().slice(0, 8)}`, cargo: 'Oficial', salarioBase: '1500000', fechaIngreso: '2026-01-01', tipoContrato: 'OBRA_LABOR' },
        usuario,
      );
      expect(creado).toMatchObject({ nombre: 'Persona Inventada E2E', tipoDocumento: 'CC', tipoContrato: 'OBRA_LABOR' });

      const eps = await tx.entidadSS.findMany({ where: { tipo: 'EPS' }, take: 2, orderBy: { nombre: 'asc' } });
      const arl = await tx.entidadSS.findFirstOrThrow({ where: { tipo: 'ARL' } });
      const claseTres = await tx.claseRiesgoArl.findUniqueOrThrow({ where: { clase: 3 } });
      const claseCinco = await tx.claseRiesgoArl.findUniqueOrThrow({ where: { clase: 5 } });

      // Recién creado: le faltan las cinco afiliaciones, el certificado y la autorización.
      const inicial = (await trabajadores.alertasSst()).trabajadores.find((t) => t.trabajadorId === creado.id);
      expect(inicial?.afiliacionesFaltantes.sort()).toEqual(['AFP', 'ARL', 'CAJA', 'CESANTIAS', 'EPS']);
      expect(inicial).toMatchObject({ sinCertificadoAfiliacion: true, sinAutorizacionSalud: true });

      // EPS, y luego cambio de EPS: la anterior queda cerrada el día anterior.
      await afiliaciones.registrar(creado.id, { tipo: 'EPS', entidadId: eps[0].id, fechaInicio: '2026-02-01' }, gerente);
      await afiliaciones.registrar(creado.id, { tipo: 'EPS', entidadId: eps[1].id, fechaInicio: '2026-07-01' }, gerente);
      const historial = (await afiliaciones.listar(creado.id)).filter((a) => a.tipo === 'EPS');
      expect(historial).toHaveLength(2);
      expect(historial.find((a) => a.fechaFin)?.fechaFin?.getTime()).toBe(new Date(2026, 5, 30).getTime());
      expect(historial.filter((a) => !a.fechaFin)).toHaveLength(1);

      // ARL con clase de riesgo, y luego la misma ARL con otra clase.
      await afiliaciones.registrar(creado.id, { tipo: 'ARL', entidadId: arl.id, claseRiesgoId: claseTres.id, fechaInicio: '2026-02-01' }, gerente);
      await afiliaciones.registrar(creado.id, { tipo: 'ARL', entidadId: arl.id, claseRiesgoId: claseCinco.id, fechaInicio: '2026-08-01' }, gerente);

      // Documento: el certificado de afiliación quita su alerta; la autorización quita la suya.
      const pdf = Buffer.from('%PDF-1.4\ncertificado inventado');
      await documentos.subir(creado.id, { buffer: pdf, originalname: 'certificado.pdf' } as Express.Multer.File, 'CERTIFICADO_AFILIACION', undefined, gerente);
      await trabajadores.registrarAutorizacionSalud(creado.id, { autoriza: true }, gerente);

      const despues = (await trabajadores.alertasSst()).trabajadores.find((t) => t.trabajadorId === creado.id);
      expect(despues?.afiliacionesFaltantes.sort()).toEqual(['AFP', 'CAJA', 'CESANTIAS']);
      expect(despues).toMatchObject({ sinCertificadoAfiliacion: false, sinAutorizacionSalud: false });

      // La ficha SST no trae salario; la tasa ARL sale de la clase vigente (la 5).
      const ficha = await trabajadores.fichaSst(creado.id, { ...usuario, permisos: ['sst.ver', 'sst.gestionar'] });
      expect(ficha).not.toHaveProperty('salarioBase');
      expect(ficha).not.toHaveProperty('pagos');
      expect(ficha.legales.tasaArl?.clase).toBe(5);
      expect(ficha.documentos).toHaveLength(1);
      expect(ficha.autorizaDatosSalud).toBe(true);

      // El detalle con nómina sí trae salario, y el contratista no ve el contrato aunque exista.
      await documentos.subir(creado.id, { buffer: pdf, originalname: 'contrato.pdf' } as Express.Multer.File, 'CONTRATO', undefined, gerente);
      const contratista = { ...usuario, permisos: ['sst.ver', 'sst.gestionar', 'sst.diagnosticos_ver'] };
      expect((await documentos.listar(creado.id, contratista)).map((d) => d.tipo)).toEqual(['CERTIFICADO_AFILIACION']);
      expect((await documentos.listar(creado.id, gerente)).map((d) => d.tipo).sort()).toEqual(['CERTIFICADO_AFILIACION', 'CONTRATO']);
      const certificado = (await documentos.listar(creado.id, contratista))[0];
      expect((await documentos.leer(creado.id, certificado.id, contratista)).buffer.equals(pdf)).toBe(true);
      const contrato = (await documentos.listar(creado.id, gerente)).find((d) => d.tipo === 'CONTRATO');
      await expect(documentos.leer(creado.id, contrato!.id, contratista)).rejects.toThrow(/No existe el documento/);
      expect((await trabajadores.buscarPorId(creado.id, gerente)).salarioBase.toString()).toBe('1500000');

      // Retiro: queda inactivo con fecha y motivo, y deja de generar alertas.
      await trabajadores.retirar(creado.id, { fechaRetiro: '2026-09-30', motivo: 'Terminó la obra' }, gerente);
      expect((await trabajadores.alertasSst()).trabajadores.some((t) => t.trabajadorId === creado.id)).toBe(false);

      // Todo quedó en la auditoría, en orden.
      const acciones = (await tx.registroAuditoria.findMany({ where: { entidadId: creado.id }, orderBy: { createdAt: 'asc' } })).map((r) => r.accion);
      expect(acciones).toEqual([
        'TRABAJADOR_CREAR',
        'TRABAJADOR_AFILIACION_REGISTRAR',
        'TRABAJADOR_AFILIACION_REGISTRAR',
        'TRABAJADOR_AFILIACION_REGISTRAR',
        'TRABAJADOR_AFILIACION_REGISTRAR',
        'TRABAJADOR_DOCUMENTO_SUBIR',
        'TRABAJADOR_AUTORIZACION_SALUD',
        'TRABAJADOR_DOCUMENTO_SUBIR',
        'TRABAJADOR_RETIRAR',
      ]);
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
