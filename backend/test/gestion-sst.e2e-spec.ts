// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
// Fijan las reglas que la base de datos exige por sí sola en la gestión SST (CC-03, fase B).
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfiguracionService } from '../src/configuracion/configuracion.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { DocumentosSstService } from '../src/sst/documentos-sst.service.js';
import { EppService } from '../src/sst/epp.service.js';
import type { StorageService } from '../src/storage/storage.service.js';

const REVERTIR = new Error('revertir');

describe('Gestión SST contra Postgres real: reglas de la base (RF-SST-12 a 21)', () => {
  const prisma = new PrismaService();
  let usuarioId: string;

  beforeAll(async () => {
    await prisma.$connect();
    usuarioId = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
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

  async function escenario(tx: Tx) {
    const sufijo = randomUUID().slice(0, 8);
    const trabajador = await tx.trabajador.create({ data: { nombre: 'Persona Inventada', documento: `E2E-${sufijo}`, cargo: 'Oficial', salarioBase: 1_500_000, fechaIngreso: dia(1, 1) } });
    const elemento = await tx.elementoEpp.create({ data: { nombre: `Elemento E2E ${sufijo}`, vidaUtilDias: 30 } });
    return { trabajador, elemento };
  }

  const datosEntrega = (e: Awaited<ReturnType<typeof escenario>>) => ({
    trabajadorId: e.trabajador.id,
    elementoId: e.elemento.id,
    fecha: dia(3, 1),
    cantidad: 2,
    motivo: 'DOTACION_INICIAL' as const,
    entregadoPor: 'Persona que entrega',
    registradaPorId: usuarioId,
    vidaUtilDias: 30,
    proximaReposicion: dia(3, 31),
  });

  const datosActividad = () => ({
    anio: 2026,
    ciclo: 'PLANEAR' as const,
    estandar: 'Recursos',
    actividad: 'Actividad de prueba',
    meta: 'Meta de prueba',
    responsable: 'Responsable Inventado',
    correoResponsable: 'responsable@ejemplo.test',
    fechaInicio: dia(2, 1),
    fechaFin: dia(2, 28),
    creadaPorId: usuarioId,
  });

  const datosCapacitacion = () => ({
    tema: 'Tema de prueba',
    objetivo: 'Objetivo de prueba',
    dirigidoA: 'Todo el personal',
    modalidad: 'PRESENCIAL' as const,
    horas: 2,
    fechaProgramada: dia(4, 10),
    responsable: 'Facilitador Inventado',
    correoResponsable: 'facilitador@ejemplo.test',
    ejecutor: 'INTERNO' as const,
    asistentesProgramados: 10,
    creadaPorId: usuarioId,
  });

  it('la semilla dejó el catálogo de EPP y la configuración trae sus dos parámetros nuevos', async () => {
    expect(await prisma.elementoEpp.count()).toBeGreaterThanOrEqual(18);
    const config = await prisma.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } });
    expect(config.diasAlertaSst).toBe(15);
    expect(config.correoAvisosSst).toBeNull();
  });

  it('la configuración rechaza una anticipación fuera de 1 a 90 días y un correo de avisos mal escrito', async () => {
    await enTransaccionRevertida(async (tx) => {
      await rechaza(tx, () => tx.$executeRaw`UPDATE "ConfiguracionEmpresa" SET "diasAlertaSst" = 0`, /dias_alerta_sst/);
      await rechaza(tx, () => tx.$executeRaw`UPDATE "ConfiguracionEmpresa" SET "diasAlertaSst" = 91`, /dias_alerta_sst/);
      await rechaza(tx, () => tx.$executeRaw`UPDATE "ConfiguracionEmpresa" SET "correoAvisosSst" = 'no-es-correo'`, /correo_avisos_sst/);
      await tx.$executeRaw`UPDATE "ConfiguracionEmpresa" SET "diasAlertaSst" = 30, "correoAvisosSst" = 'sst@ejemplo.test'`;
    });
  });

  it('un elemento de EPP exige una vida útil de al menos un día y no se borra', async () => {
    await enTransaccionRevertida(async (tx) => {
      const { elemento } = await escenario(tx);
      await rechaza(tx, () => tx.elementoEpp.create({ data: { nombre: 'Elemento inválido', vidaUtilDias: 0 } }), /vida_util_valida/);
      await rechaza(tx, () => tx.$executeRaw`DELETE FROM "ElementoEpp" WHERE "id" = ${elemento.id}`, /no se borran/);
    });
  });

  it('una entrega de EPP: datos válidos, y la base rechaza cantidad en cero, reposición anterior a la entrega y entrega sin nombre', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      await tx.entregaEpp.create({ data: datosEntrega(e) });
      await rechaza(tx, () => tx.entregaEpp.create({ data: { ...datosEntrega(e), cantidad: 0 } }), /cantidad_valida/);
      await rechaza(tx, () => tx.entregaEpp.create({ data: { ...datosEntrega(e), proximaReposicion: dia(3, 1) } }), /reposicion_posterior/);
      await rechaza(tx, () => tx.entregaEpp.create({ data: { ...datosEntrega(e), entregadoPor: '  ' } }), /entregado_por_no_vacio/);
    });
  });

  it('una entrega no se borra ni se edita, ni con acceso directo a la base: solo se anula, una vez y con motivo', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      const entrega = await tx.entregaEpp.create({ data: datosEntrega(e) });

      await rechaza(tx, () => tx.$executeRaw`DELETE FROM "EntregaEpp" WHERE "id" = ${entrega.id}`, /no se puede borrar/);
      await rechaza(tx, () => tx.$executeRaw`UPDATE "EntregaEpp" SET "cantidad" = 5 WHERE "id" = ${entrega.id}`, /no se puede editar/);
      await rechaza(tx, () => tx.$executeRaw`UPDATE "EntregaEpp" SET "proximaReposicion" = ${dia(12, 1)} WHERE "id" = ${entrega.id}`, /no se puede editar/);

      // Marcar que firmó el recibido y anotar un aviso enviado sí se permite.
      await tx.entregaEpp.update({ where: { id: entrega.id }, data: { firmoRecibido: true, avisoPorReponerEn: new Date() } });

      // Una anulación incompleta (sin motivo) la rechaza la base.
      await rechaza(tx, () => tx.entregaEpp.update({ where: { id: entrega.id }, data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuarioId } }), /anulacion_completa/);

      await tx.entregaEpp.update({ where: { id: entrega.id }, data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuarioId, motivoAnulacion: 'Se registró por error' } });

      // Una vez anulada ya no cambia: ni se reactiva, ni se cambia el motivo, ni la firma.
      await rechaza(tx, () => tx.$executeRaw`UPDATE "EntregaEpp" SET "motivoAnulacion" = 'otro motivo' WHERE "id" = ${entrega.id}`, /anulada no se puede modificar/);
      await rechaza(tx, () => tx.$executeRaw`UPDATE "EntregaEpp" SET "firmoRecibido" = false WHERE "id" = ${entrega.id}`, /anulada no se puede modificar/);
    });
  });

  it('una actividad del plan: fechas en orden, avance de 0 a 100, ejecutada al cien, correo válido y sin borrado', async () => {
    await enTransaccionRevertida(async (tx) => {
      const actividad = await tx.actividadPlan.create({ data: datosActividad() });
      await rechaza(tx, () => tx.actividadPlan.create({ data: { ...datosActividad(), fechaFin: dia(1, 1) } }), /fechas_en_orden/);
      await rechaza(tx, () => tx.actividadPlan.create({ data: { ...datosActividad(), porcentajeAvance: 101 } }), /avance_valido/);
      await rechaza(tx, () => tx.actividadPlan.create({ data: { ...datosActividad(), estado: 'EJECUTADA', porcentajeAvance: 60 } }), /ejecutada_al_cien/);
      await rechaza(tx, () => tx.actividadPlan.create({ data: { ...datosActividad(), presupuesto: -1 } }), /presupuesto_valido/);
      await rechaza(tx, () => tx.actividadPlan.create({ data: { ...datosActividad(), correoResponsable: 'sin-arroba' } }), /correo_valido/);
      await rechaza(tx, () => tx.actividadPlan.create({ data: { ...datosActividad(), actividad: '   ' } }), /textos_no_vacios/);
      await tx.actividadPlan.create({ data: { ...datosActividad(), estado: 'EJECUTADA', porcentajeAvance: 100, presupuesto: 500_000 } });
      await rechaza(tx, () => tx.$executeRaw`DELETE FROM "ActividadPlan" WHERE "id" = ${actividad.id}`, /no se borran/);
    });
  });

  it('una capacitación: ejecutada solo con fecha de ejecución, horas positivas, eficacia de 1 a 5 y sin borrado', async () => {
    await enTransaccionRevertida(async (tx) => {
      const capacitacion = await tx.capacitacion.create({ data: datosCapacitacion() });
      await rechaza(tx, () => tx.capacitacion.create({ data: { ...datosCapacitacion(), estado: 'EJECUTADA' } }), /ejecutada_con_fecha/);
      await rechaza(tx, () => tx.capacitacion.create({ data: { ...datosCapacitacion(), horas: 0 } }), /horas_validas/);
      await rechaza(tx, () => tx.capacitacion.create({ data: { ...datosCapacitacion(), evaluacionEficacia: 6 } }), /eficacia_valida/);
      await rechaza(tx, () => tx.capacitacion.create({ data: { ...datosCapacitacion(), asistentesProgramados: -1 } }), /programados_validos/);
      await tx.capacitacion.create({ data: { ...datosCapacitacion(), estado: 'EJECUTADA', fechaEjecucion: dia(4, 10), evaluacionEficacia: 4.5 } });
      await rechaza(tx, () => tx.$executeRaw`DELETE FROM "Capacitacion" WHERE "id" = ${capacitacion.id}`, /no se borran/);
    });
  });

  it('la asistencia: una sola vigente por trabajador, anulación con motivo, no se reactiva ni se borra, y se puede volver a registrar', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      const capacitacion = await tx.capacitacion.create({ data: datosCapacitacion() });
      const base = { capacitacionId: capacitacion.id, trabajadorId: e.trabajador.id, registradaPorId: usuarioId };

      const asistencia = await tx.asistenciaCapacitacion.create({ data: { ...base, firmo: true, calificacion: 4.5 } });
      await rechaza(tx, () => tx.asistenciaCapacitacion.create({ data: base }), /una_vigente|Unique constraint/);
      // La calificación inválida se prueba con otro trabajador, para que solo pueda dispararla su propia regla.
      const otro = await tx.trabajador.create({ data: { nombre: 'Otra Persona Inventada', documento: `E2E-${randomUUID().slice(0, 8)}`, cargo: 'Ayudante', salarioBase: 1_300_000, fechaIngreso: dia(1, 1) } });
      await rechaza(tx, () => tx.asistenciaCapacitacion.create({ data: { ...base, trabajadorId: otro.id, calificacion: 6 } }), /calificacion_valida/);
      await rechaza(tx, () => tx.$executeRaw`DELETE FROM "AsistenciaCapacitacion" WHERE "id" = ${asistencia.id}`, /no se puede borrar/);
      await rechaza(tx, () => tx.asistenciaCapacitacion.update({ where: { id: asistencia.id }, data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuarioId } }), /anulacion_completa/);

      await tx.asistenciaCapacitacion.update({ where: { id: asistencia.id }, data: { anulada: true, anuladaEn: new Date(), anuladaPorId: usuarioId, motivoAnulacion: 'No asistió' } });
      await rechaza(tx, () => tx.$executeRaw`UPDATE "AsistenciaCapacitacion" SET "anulada" = false, "anuladaEn" = NULL, "anuladaPorId" = NULL, "motivoAnulacion" = NULL WHERE "id" = ${asistencia.id}`, /no se puede reactivar/);

      // Con la anterior anulada, el trabajador puede registrarse de nuevo.
      await tx.asistenciaCapacitacion.create({ data: base });
      expect(await tx.asistenciaCapacitacion.count({ where: { capacitacionId: capacitacion.id, anulada: false } })).toBe(1);
    });
  });

  it('un adjunto SST pertenece a exactamente uno de los tres registros y no se borra', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      const entrega = await tx.entregaEpp.create({ data: datosEntrega(e) });
      const actividad = await tx.actividadPlan.create({ data: datosActividad() });
      const base = { nombreOriginal: 'acta.pdf', ruta: 'sst/prueba.pdf', tipoMime: 'application/pdf', tamano: 1234, subidoPorId: usuarioId };

      const documento = await tx.documentoSst.create({ data: { ...base, entregaEppId: entrega.id } });
      await rechaza(tx, () => tx.documentoSst.create({ data: base }), /un_solo_dueno/);
      await rechaza(tx, () => tx.documentoSst.create({ data: { ...base, entregaEppId: entrega.id, actividadPlanId: actividad.id } }), /un_solo_dueno/);
      await rechaza(tx, () => tx.documentoSst.create({ data: { ...base, entregaEppId: entrega.id, tamano: 0 } }), /tamano_valido/);
      await rechaza(tx, () => tx.$executeRaw`DELETE FROM "DocumentoSst" WHERE "id" = ${documento.id}`, /no se borran/);
    });
  });

  it('recorrido completo con los servicios reales: catálogo, entrega, firma, reposición por estado, anulación y acta adjunta', async () => {
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
      const configuracion = new ConfiguracionService(proxy, almacenamiento);
      const epp = new EppService(proxy, configuracion);
      const documentos = new DocumentosSstService(proxy, almacenamiento);
      const fila = await prisma.usuario.findFirstOrThrow({ include: { rol: true } });
      const usuario = { id: fila.id, email: fila.email, nombre: fila.nombre, rol: { id: fila.rol.id, clave: fila.rol.clave, nombre: fila.rol.nombre }, permisos: fila.rol.permisos, proyectoIds: null };

      const sufijo = randomUUID().slice(0, 8);
      const trabajador = await tx.trabajador.create({ data: { nombre: 'Persona Inventada', documento: `E2E-${sufijo}`, cargo: 'Oficial', salarioBase: 1_500_000, fechaIngreso: dia(1, 1) } });
      const casco = await epp.crearElemento({ nombre: `Casco E2E ${sufijo}`, vidaUtilDias: 30 }, usuario);
      const guantes = await epp.crearElemento({ nombre: `Guantes E2E ${sufijo}`, vidaUtilDias: 365 }, usuario);

      // Hoy es el 10 de junio. El casco se entregó el 1 de mayo (vida útil de 30 días): su reposición era el 31 de mayo.
      const hoy = new Date(2026, 5, 10);
      const entregaCasco = await epp.registrarEntrega({ trabajadorId: trabajador.id, elementoId: casco.id, fecha: '2026-05-01', cantidad: 1, motivo: 'DOTACION_INICIAL', tallaReferencia: 'M' }, usuario, hoy);
      await epp.registrarEntrega({ trabajadorId: trabajador.id, elementoId: guantes.id, fecha: '2026-06-01', cantidad: 2, motivo: 'DOTACION_INICIAL' }, usuario, hoy);
      expect(entregaCasco.vidaUtilDias).toBe(30);
      expect(entregaCasco.proximaReposicion).toEqual(dia(5, 31));

      const propias = async () => (await epp.reposiciones({ estado: 'TODOS', trabajadorId: trabajador.id }, hoy)).reposiciones;
      expect((await propias()).map((r) => [r.elemento.nombre.split(' E2E')[0], r.estado])).toEqual([
        ['Casco', 'VENCIDO'],
        ['Guantes', 'VIGENTE'],
      ]);

      // Cambiar la vida útil del catálogo no mueve las entregas que ya se hicieron.
      await epp.actualizarElemento(casco.id, { vidaUtilDias: 90 }, usuario);
      expect((await tx.entregaEpp.findUniqueOrThrow({ where: { id: entregaCasco.id } })).proximaReposicion).toEqual(dia(5, 31));

      // Marcar la firma, y adjuntar el acta (solo PDF de verdad).
      await epp.marcarFirma(entregaCasco.id, usuario);
      const pdf = Buffer.from('%PDF-1.4\nacta inventada');
      const adjunto = await documentos.subir({ tipo: 'entregaEpp', id: entregaCasco.id }, { buffer: pdf, originalname: 'acta.pdf' } as Express.Multer.File, 'Acta firmada', usuario);
      expect((await documentos.leer({ tipo: 'entregaEpp', id: entregaCasco.id }, adjunto.id)).buffer.equals(pdf)).toBe(true);
      await expect(documentos.leer({ tipo: 'entregaEpp', id: randomUUID() }, adjunto.id)).rejects.toThrow(/No existe el documento/);

      // Una reposición reinicia el reloj: ya no hay casco vencido.
      await epp.registrarEntrega({ trabajadorId: trabajador.id, elementoId: casco.id, fecha: '2026-06-05', cantidad: 1, motivo: 'REPOSICION_VIDA_UTIL' }, usuario, hoy);
      expect((await propias()).find((r) => r.elemento.nombre.startsWith('Casco'))?.estado).toBe('VIGENTE');

      // Anular la reposición devuelve la alerta del casco vencido; la anulada ya no admite adjuntos ni cambios.
      const reposicion = (await epp.listarEntregas({ trabajadorId: trabajador.id, elementoId: casco.id })).find((e) => e.motivo === 'REPOSICION_VIDA_UTIL');
      await epp.anularEntrega(reposicion!.id, { motivo: 'Se registró por error' }, usuario);
      expect((await propias()).find((r) => r.elemento.nombre.startsWith('Casco'))?.estado).toBe('VENCIDO');
      await expect(documentos.subir({ tipo: 'entregaEpp', id: reposicion!.id }, { buffer: pdf, originalname: 'acta.pdf' } as Express.Multer.File, undefined, usuario)).rejects.toThrow(/anulada/);

      // Un trabajador retirado deja de aparecer en las reposiciones y no recibe entregas nuevas.
      await tx.trabajador.update({ where: { id: trabajador.id }, data: { estado: 'INACTIVO', fechaRetiro: dia(6, 1), motivoRetiro: 'Terminó la obra' } });
      expect(await propias()).toEqual([]);
      await expect(epp.registrarEntrega({ trabajadorId: trabajador.id, elementoId: guantes.id, fecha: '2026-06-09', cantidad: 1, motivo: 'PERDIDA' }, usuario, hoy)).rejects.toThrow(/retirado/);

      // Todo quedó en la auditoría, en orden.
      const acciones = (await tx.registroAuditoria.findMany({ where: { OR: [{ entidad: 'ENTREGA_EPP' }, { entidad: 'ELEMENTO_EPP' }], createdAt: { gte: new Date(Date.now() - 60_000) } }, orderBy: { createdAt: 'asc' } })).map((r) => r.accion);
      expect(acciones).toEqual([
        'ELEMENTO_EPP_CREAR',
        'ELEMENTO_EPP_CREAR',
        'ENTREGA_EPP_REGISTRAR',
        'ENTREGA_EPP_REGISTRAR',
        'ELEMENTO_EPP_EDITAR',
        'ENTREGA_EPP_FIRMA',
        'SST_DOCUMENTO_SUBIR',
        'ENTREGA_EPP_REGISTRAR',
        'ENTREGA_EPP_ANULAR',
      ]);
    });
  });

  it('el historial de avisos SST solo se inserta: no se edita ni se borra', async () => {
    await enTransaccionRevertida(async (tx) => {
      const aviso = await tx.avisoSst.create({ data: { tipo: 'EPP', estado: 'OMITIDA', destinatario: 'sst@ejemplo.test', asunto: 'Prueba', detalle: 'Correo no configurado', cantidad: 3 } });
      await rechaza(tx, () => tx.$executeRaw`UPDATE "AvisoSst" SET "estado" = 'ENVIADA' WHERE "id" = ${aviso.id}`, /no se pueden editar ni borrar/);
      await rechaza(tx, () => tx.$executeRaw`DELETE FROM "AvisoSst" WHERE "id" = ${aviso.id}`, /no se pueden editar ni borrar/);
    });
  });
});
