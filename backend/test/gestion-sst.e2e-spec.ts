// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
// Fijan las reglas que la base de datos exige por sí sola en la gestión SST (CC-03, fase B).
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfiguracionService } from '../src/configuracion/configuracion.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { EmailService } from '../src/email/email.service.js';
import { AvisosSstService } from '../src/sst/avisos-sst.service.js';
import { CapacitacionesService } from '../src/sst/capacitaciones.service.js';
import { DocumentosSstService } from '../src/sst/documentos-sst.service.js';
import { EppService } from '../src/sst/epp.service.js';
import { PlanTrabajoService } from '../src/sst/plan-trabajo.service.js';
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

  // Los servicios reales, trabajando dentro de la transacción de la prueba: lo que escriben se revierte al final.
  async function serviciosEnTransaccion(tx: Tx) {
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
    const fila = await prisma.usuario.findFirstOrThrow({ include: { rol: true } });
    const usuario = { id: fila.id, email: fila.email, nombre: fila.nombre, rol: { id: fila.rol.id, clave: fila.rol.clave, nombre: fila.rol.nombre }, permisos: fila.rol.permisos, proyectoIds: null };
    return {
      proxy,
      configuracion,
      epp: new EppService(proxy, configuracion),
      plan: new PlanTrabajoService(proxy, configuracion),
      capacitaciones: new CapacitacionesService(proxy, configuracion),
      documentos: new DocumentosSstService(proxy, almacenamiento),
      usuario,
    };
  }

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
      // Solo lo de este recorrido: los archivos e2e corren en paralelo y otros crean elementos y entregas de EPP que también quedan
      // en la auditoría, así que no se puede leer "lo de los últimos segundos".
      const entregasPropias = await tx.entregaEpp.findMany({ where: { trabajadorId: trabajador.id }, select: { id: true } });
      const idsPropios = [casco.id, guantes.id, ...entregasPropias.map((e) => e.id)];
      const acciones = (await tx.registroAuditoria.findMany({ where: { OR: [{ entidad: 'ENTREGA_EPP' }, { entidad: 'ELEMENTO_EPP' }], entidadId: { in: idsPropios } }, orderBy: { createdAt: 'asc' } })).map((r) => r.accion);
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

  it('recorrido del plan de trabajo con los servicios reales: crear, cronograma, alertas, editar, evidencia y copiar al año siguiente', async () => {
    await enTransaccionRevertida(async (tx) => {
      const { plan, documentos, usuario } = await serviciosEnTransaccion(tx);
      const hoy = new Date(2026, 5, 10);

      const base = { anio: 2026, ciclo: 'PLANEAR' as const, estandar: 'Recursos', meta: 'Meta de prueba', responsable: 'Responsable Inventado', correoResponsable: 'responsable@ejemplo.test' };
      const ejecutada = await plan.crear({ ...base, actividad: 'Definir el presupuesto', fechaInicio: '2026-02-01', fechaFin: '2026-03-15', estado: 'EJECUTADA', presupuesto: '500000' }, usuario);
      const vencida = await plan.crear({ ...base, ciclo: 'HACER', actividad: 'Inspecciones de obra', fechaInicio: '2026-05-01', fechaFin: '2026-06-01', estado: 'EN_EJECUCION', porcentajeAvance: 40 }, usuario);
      const proxima = await plan.crear({ ...base, ciclo: 'VERIFICAR', actividad: 'Auditoría interna', fechaInicio: '2026-06-01', fechaFin: '2026-06-20' }, usuario);
      const cancelada = await plan.crear({ ...base, ciclo: 'ACTUAR', actividad: 'Actividad que no va', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', estado: 'CANCELADA' }, usuario);
      expect(ejecutada.porcentajeAvance).toBe(100);

      const listado = await plan.listar({ anio: '2026' }, hoy);
      const propias = Object.fromEntries(listado.actividades.filter((a) => [ejecutada.id, vencida.id, proxima.id, cancelada.id].includes(a.id)).map((a) => [a.id, a]));
      expect(propias[ejecutada.id]).toMatchObject({ alerta: 'SIN_ALERTA' });
      expect(propias[ejecutada.id].meses.map((m, i) => (m ? i + 1 : 0)).filter(Boolean)).toEqual([2, 3]);
      expect(propias[vencida.id]).toMatchObject({ alerta: 'VENCIDA', diasRestantes: -9 });
      expect(propias[proxima.id]).toMatchObject({ alerta: 'PROXIMA', diasRestantes: 10 });
      expect(propias[cancelada.id]).toMatchObject({ alerta: 'SIN_ALERTA' });

      // Reprogramar la vencida: nueva fecha de fin, vuelve a "próxima".
      const reprogramada = await plan.actualizar(vencida.id, { fechaFin: '2026-06-18', estado: 'REPROGRAMADA' }, usuario);
      expect(reprogramada.estado).toBe('REPROGRAMADA');
      expect((await plan.buscar(vencida.id, hoy)).alerta).toBe('PROXIMA');

      // La base exige lo mismo que el servicio: una ejecutada sin 100 % nunca llega a guardarse.
      await rechaza(tx, () => tx.actividadPlan.update({ where: { id: ejecutada.id }, data: { porcentajeAvance: 60 } }), /ejecutada_al_cien/);

      // Evidencia adjunta y descarga solo de la actividad dueña.
      const pdf = Buffer.from('%PDF-1.4\nevidencia inventada');
      const adjunto = await documentos.subir({ tipo: 'actividadPlan', id: proxima.id }, { buffer: pdf, originalname: 'evidencia.pdf' } as Express.Multer.File, 'Acta de la auditoría', usuario);
      expect((await documentos.leer({ tipo: 'actividadPlan', id: proxima.id }, adjunto.id)).buffer.equals(pdf)).toBe(true);
      await expect(documentos.leer({ tipo: 'actividadPlan', id: vencida.id }, adjunto.id)).rejects.toThrow(/No existe el documento/);

      // Copiar al año siguiente: las no canceladas pasan como borrador, con fechas movidas y sin avance.
      // Si la base tuviera otras actividades de 2026 también se copiarían: lo que se comprueba es lo propio de esta prueba.
      const copia = await plan.copiarAnio({ anioOrigen: 2026, anioDestino: 2089 }, usuario);
      expect(copia).toMatchObject({ anioOrigen: 2026, anioDestino: 2089 });
      const copiadas = await tx.actividadPlan.findMany({ where: { anio: 2089 }, orderBy: { fechaInicio: 'asc' } });
      expect(copiadas.length).toBeGreaterThanOrEqual(3);
      expect(copiadas.every((c) => c.estado === 'PROGRAMADA' && c.porcentajeAvance === 0 && c.avisoProximaEn === null)).toBe(true);
      expect(copiadas.some((c) => c.actividad === 'Actividad que no va')).toBe(false);
      expect(copiadas.find((c) => c.actividad === 'Auditoría interna')?.fechaFin).toEqual(new Date(2089, 5, 20));
      await expect(plan.copiarAnio({ anioOrigen: 2026, anioDestino: 2089 }, usuario)).rejects.toThrow(/ya tiene/);
    });
  });

  it('recorrido de capacitaciones con los servicios reales: crear, asistencia masiva, cobertura, anulación, ejecutar y soporte', async () => {
    await enTransaccionRevertida(async (tx) => {
      const { capacitaciones, documentos, usuario } = await serviciosEnTransaccion(tx);
      const hoy = new Date(2026, 5, 10);
      const sufijo = randomUUID().slice(0, 8);
      const trabajadores = await Promise.all(
        [1, 2, 3].map((n) => tx.trabajador.create({ data: { nombre: `Persona Inventada ${n}`, documento: `E2E-${sufijo}-${n}`, cargo: 'Oficial', salarioBase: 1_500_000, fechaIngreso: dia(1, 1) } })),
      );

      const capacitacion = await capacitaciones.crear(
        { tema: `Alturas E2E ${sufijo}`, objetivo: 'Reducir el riesgo de caídas', dirigidoA: 'Personal de obra', modalidad: 'PRESENCIAL', horas: 2, fechaProgramada: '2026-06-20', responsable: 'Facilitador Inventado', correoResponsable: 'facilitador@ejemplo.test', ejecutor: 'INTERNO', asistentesProgramados: 4 },
        usuario,
      );
      const propia = async () => (await capacitaciones.listar({ anio: '2026' }, hoy)).capacitaciones.find((c) => c.id === capacitacion.id)!;
      expect(await propia()).toMatchObject({ asistentesReales: 0, cobertura: 0, alerta: 'PROXIMA', diasRestantes: 10 });

      // Asistencia de tres trabajadores de una vez; repetirla no duplica.
      const registro = await capacitaciones.registrarAsistentes(capacitacion.id, { asistentes: trabajadores.map((t, i) => ({ trabajadorId: t.id, firmo: i < 2, calificacion: i === 0 ? 4.5 : undefined })) }, usuario);
      expect(registro).toEqual({ registrados: 3, omitidos: 0 });
      expect(await capacitaciones.registrarAsistentes(capacitacion.id, { asistentes: [{ trabajadorId: trabajadores[0].id }] }, usuario)).toEqual({ registrados: 0, omitidos: 1 });
      expect(await propia()).toMatchObject({ asistentesReales: 3, cobertura: 75 });

      // Editar firma y calificación; anular a uno por error y volver a registrarlo.
      const detalle = await capacitaciones.buscar(capacitacion.id, hoy);
      const deTercero = detalle.asistencias.find((a) => a.trabajadorId === trabajadores[2].id)!;
      await capacitaciones.actualizarAsistencia(capacitacion.id, deTercero.id, { firmo: true, calificacion: 3 }, usuario);
      await capacitaciones.anularAsistencia(capacitacion.id, deTercero.id, { motivo: 'Se registró por error' }, usuario);
      expect(await propia()).toMatchObject({ asistentesReales: 2, cobertura: 50 });
      await capacitaciones.registrarAsistentes(capacitacion.id, { asistentes: [{ trabajadorId: trabajadores[2].id }] }, usuario);
      expect(await propia()).toMatchObject({ asistentesReales: 3 });
      expect((await capacitaciones.buscar(capacitacion.id, hoy)).asistenciasAnuladas).toBe(1);

      // Un retirado no se agrega a la asistencia.
      await tx.trabajador.update({ where: { id: trabajadores[0].id }, data: { estado: 'INACTIVO', fechaRetiro: dia(6, 1), motivoRetiro: 'Terminó la obra' } });
      const otraAsistente = await tx.trabajador.create({ data: { nombre: 'Persona Retirada', documento: `E2E-${sufijo}-4`, cargo: 'Ayudante', salarioBase: 1_300_000, fechaIngreso: dia(1, 1), estado: 'INACTIVO', fechaRetiro: dia(6, 1), motivoRetiro: 'Terminó la obra' } });
      await expect(capacitaciones.registrarAsistentes(capacitacion.id, { asistentes: [{ trabajadorId: otraAsistente.id }] }, usuario)).rejects.toThrow(/retirados/);

      // Ejecutarla exige la fecha de ejecución; ejecutada ya no genera alerta; el listado de asistencia se adjunta.
      await expect(capacitaciones.actualizar(capacitacion.id, { estado: 'EJECUTADA' }, usuario)).rejects.toThrow(/fecha de ejecución/);
      await capacitaciones.actualizar(capacitacion.id, { estado: 'EJECUTADA', fechaEjecucion: '2026-06-20', evaluacionEficacia: 4.2 }, usuario);
      expect(await propia()).toMatchObject({ estado: 'EJECUTADA', alerta: 'SIN_ALERTA' });
      const pdf = Buffer.from('%PDF-1.4\nlistado inventado');
      const adjunto = await documentos.subir({ tipo: 'capacitacion', id: capacitacion.id }, { buffer: pdf, originalname: 'listado.pdf' } as Express.Multer.File, 'Listado firmado', usuario);
      expect((await documentos.leer({ tipo: 'capacitacion', id: capacitacion.id }, adjunto.id)).buffer.equals(pdf)).toBe(true);
      expect((await capacitaciones.listar({ anio: '2026' }, hoy)).resumen.ejecutadas).toBeGreaterThanOrEqual(1);

      // Una cancelada ya no admite asistentes.
      const otra = await capacitaciones.crear({ tema: `Otra E2E ${sufijo}`, objetivo: 'Objetivo', dirigidoA: 'Todos', modalidad: 'VIRTUAL', horas: 1, fechaProgramada: '2026-08-01', responsable: 'Facilitador', correoResponsable: 'f@ejemplo.test', ejecutor: 'ARL', asistentesProgramados: 5, estado: 'CANCELADA' }, usuario);
      await expect(capacitaciones.registrarAsistentes(otra.id, { asistentes: [{ trabajadorId: trabajadores[1].id }] }, usuario)).rejects.toThrow(/cancelada/);

      const acciones = (await tx.registroAuditoria.findMany({ where: { entidadId: capacitacion.id }, orderBy: { createdAt: 'asc' } })).map((r) => r.accion);
      expect(acciones).toEqual([
        'CAPACITACION_CREAR',
        'CAPACITACION_ASISTENCIA_REGISTRAR',
        'CAPACITACION_ASISTENCIA_EDITAR',
        'CAPACITACION_ASISTENCIA_ANULAR',
        'CAPACITACION_ASISTENCIA_REGISTRAR',
        'CAPACITACION_EDITAR',
        'SST_DOCUMENTO_SUBIR',
      ]);
    });
  });

  it('avisos por correo con los servicios reales: salen una vez por estado, no se repiten, se rearman al reprogramar y se reintentan tras un fallo', async () => {
    await enTransaccionRevertida(async (tx) => {
      const { proxy, configuracion, epp, plan, capacitaciones, usuario } = await serviciosEnTransaccion(tx);
      const hoy = new Date(2026, 5, 10);
      const sufijo = randomUUID().slice(0, 8);

      // El correo de avisos SST se configura (el valor es de prueba y se revierte con la transacción).
      await tx.configuracionEmpresa.update({ where: { id: 1 }, data: { correoAvisosSst: 'sst-prueba@ejemplo.test' } });

      // Un correo falso que guarda lo que se envía y que se puede hacer fallar.
      const enviados: { to: string; subject: string }[] = [];
      let fallar = false;
      const correo = {
        estaConfigurado: () => true,
        enviar: (datos: { to: string; subject: string }) => {
          if (fallar) return Promise.reject(new Error('SMTP caído'));
          enviados.push({ to: datos.to, subject: datos.subject });
          return Promise.resolve();
        },
      } as unknown as EmailService;
      const avisos = new AvisosSstService(proxy, correo, configuracion);

      const proximaActividad = await plan.crear({ anio: 2026, ciclo: 'VERIFICAR', estandar: 'Verificación', actividad: `Auditoría E2E ${sufijo}`, meta: 'Auditoría realizada', responsable: 'Responsable Inventado', correoResponsable: `resp-${sufijo}@ejemplo.test`, fechaInicio: '2026-06-01', fechaFin: '2026-06-20' }, usuario);
      const vencidaActividad = await plan.crear({ anio: 2026, ciclo: 'HACER', estandar: 'Gestión', actividad: `Inspección E2E ${sufijo}`, meta: 'Inspección realizada', responsable: 'Otra Persona Inventada', correoResponsable: `otra-${sufijo}@ejemplo.test`, fechaInicio: '2026-05-01', fechaFin: '2026-06-01', estado: 'EN_EJECUCION' }, usuario);
      const capacitacion = await capacitaciones.crear({ tema: `Alturas E2E ${sufijo}`, objetivo: 'Objetivo', dirigidoA: 'Personal de obra', modalidad: 'PRESENCIAL', horas: 2, fechaProgramada: '2026-06-15', responsable: 'Facilitador Inventado', correoResponsable: `fac-${sufijo}@ejemplo.test`, ejecutor: 'INTERNO', asistentesProgramados: 5 }, usuario);

      const trabajador = await tx.trabajador.create({ data: { nombre: 'Persona Inventada', documento: `E2E-${sufijo}`, cargo: 'Oficial', salarioBase: 1_500_000, fechaIngreso: dia(1, 1) } });
      const casco = await epp.crearElemento({ nombre: `Casco E2E ${sufijo}`, vidaUtilDias: 30 }, usuario);
      await epp.registrarEntrega({ trabajadorId: trabajador.id, elementoId: casco.id, fecha: '2026-04-15', cantidad: 1, motivo: 'DOTACION_INICIAL' }, usuario, hoy);

      // Primera pasada: sale un correo a cada responsable y un resumen de EPP (el casco se entregó el 15 de abril: venció el 15 de mayo).
      const primera = await avisos.enviarPendientes(hoy);
      expect(primera.actividades.enviados).toBe(2);
      expect(primera.capacitaciones.enviados).toBe(1);
      expect(primera.epp.enviados).toBe(1);
      const propios = enviados.filter((e) => e.to.includes(sufijo) || e.to === 'sst-prueba@ejemplo.test');
      expect(propios.map((e) => e.to).sort()).toEqual([`fac-${sufijo}@ejemplo.test`, `otra-${sufijo}@ejemplo.test`, `resp-${sufijo}@ejemplo.test`, 'sst-prueba@ejemplo.test'].sort());
      expect(propios.find((e) => e.to === `otra-${sufijo}@ejemplo.test`)?.subject).toMatch(/vencida/);
      expect(propios.find((e) => e.to === `resp-${sufijo}@ejemplo.test`)?.subject).toMatch(/próxima a vencer/);

      // Quedó marcado en la base y anotado en el historial.
      expect((await tx.actividadPlan.findUniqueOrThrow({ where: { id: proximaActividad.id } })).avisoProximaEn).not.toBeNull();
      expect((await tx.actividadPlan.findUniqueOrThrow({ where: { id: vencidaActividad.id } })).avisoVencidaEn).not.toBeNull();
      expect((await tx.capacitacion.findUniqueOrThrow({ where: { id: capacitacion.id } })).avisoProximaEn).not.toBeNull();
      const historial = await avisos.listarAvisos({ estado: 'ENVIADA' });
      expect(historial.filter((h) => h.destinatario?.includes(sufijo) || h.destinatario === 'sst-prueba@ejemplo.test').length).toBe(4);

      // Segunda pasada el mismo día: no se repite nada.
      const cuantos = enviados.length;
      const segunda = await avisos.enviarPendientes(hoy);
      expect(segunda).toEqual({ actividades: { enviados: 0, fallidos: 0, omitidos: 0 }, capacitaciones: { enviados: 0, fallidos: 0, omitidos: 0 }, epp: { enviados: 0, fallidos: 0, omitidos: 0 } });
      expect(enviados.length).toBe(cuantos);

      // Reprogramar la que vencía a una fecha próxima rearma el aviso: sale otra vez al llegar al nuevo estado.
      await plan.actualizar(vencidaActividad.id, { fechaFin: '2026-06-18', estado: 'REPROGRAMADA' }, usuario);
      expect((await tx.actividadPlan.findUniqueOrThrow({ where: { id: vencidaActividad.id } })).avisoVencidaEn).toBeNull();
      const tercera = await avisos.enviarPendientes(hoy);
      expect(tercera.actividades.enviados).toBe(1);
      expect(enviados.at(-1)?.subject).toMatch(/próxima a vencer/);

      // Un fallo del correo no pierde el aviso: queda "fallida", se libera y sale al siguiente intento.
      const aplazada = await capacitaciones.actualizar(capacitacion.id, { fechaProgramada: '2026-06-12', estado: 'REPROGRAMADA' }, usuario);
      expect(aplazada.avisoProximaEn).toBeNull();
      fallar = true;
      const conFallo = await avisos.enviarPendientes(hoy);
      expect(conFallo.capacitaciones).toEqual({ enviados: 0, fallidos: 1, omitidos: 0 });
      expect((await tx.capacitacion.findUniqueOrThrow({ where: { id: capacitacion.id } })).avisoProximaEn).toBeNull();
      expect((await avisos.listarAvisos({ estado: 'FALLIDA' })).some((h) => h.capacitacionId === capacitacion.id && h.detalle === 'SMTP caído')).toBe(true);
      fallar = false;
      expect((await avisos.enviarPendientes(hoy)).capacitaciones.enviados).toBe(1);

      // El historial no se puede editar ni borrar, ni con acceso directo a la base.
      const anotado = await tx.avisoSst.findFirstOrThrow({ where: { tipo: 'EPP' } });
      await rechaza(tx, () => tx.$executeRaw`DELETE FROM "AvisoSst" WHERE "id" = ${anotado.id}`, /no se pueden editar ni borrar/);
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
