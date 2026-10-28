// Prueba de punta a punta del ausentismo (CC-03 fase C): arranca la app completa con los guardas reales y entra con un token de
// cada rol. Fija lo más importante de la fase: quién ve el diagnóstico y quién ve los valores (RF-USR-11, RNF-LEG-03,
// RNF-SEG-08), que cada consulta de un diagnóstico queda en la auditoría y las reglas de registro, prórroga y anulación.
//
// Requiere Postgres arriba y backend/.env, y SOLO corre contra una base de datos local. Un ausentismo no se puede borrar (la
// base lo impide), así que esta prueba limpia al terminar desactivando los triggers de protección dentro de una
// transacción de su propia sesión (solo en una base local de desarrollo). Todo lo que crea tiene datos inventados.
import 'dotenv/config';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const CORREO = (clave: string) => `e2e-aus-${clave.toLowerCase()}@ejemplo.test`;
const SALARIO_DE_PRUEBA = '3333333';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('Ausentismo por rol, con los guardas reales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let trabajadorId: string;
  let tipoGeneralId: string;
  let tipoLutoId: string;
  let diagnosticoId: string;
  const tokens: Record<string, string> = {};
  let primero: string;
  let prorroga: string;

  async function limpiar() {
    const trabajadores = await prisma.trabajador.findMany({ where: { documento: { startsWith: 'E2E-AUS-' } }, select: { id: true } });
    const ausentismos = await prisma.ausentismo.findMany({ where: { trabajadorId: { in: trabajadores.map((t) => t.id) } }, select: { id: true } });
    const ids = ausentismos.map((a) => a.id);
    await prisma.$transaction(async (tx) => {
      // Solo para limpiar los datos de esta prueba: los registros de ausentismo y la auditoría no se pueden borrar de otro modo.
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.documentoSst.deleteMany({ where: { ausentismoId: { in: ids } } });
      await tx.recobroAusentismo.deleteMany({ where: { ausentismoId: { in: ids } } });
      await tx.ausentismoPeriodo.deleteMany({ where: { ausentismoId: { in: ids } } });
      await tx.ausentismo.deleteMany({ where: { id: { in: ids } } });
      await tx.registroAuditoria.deleteMany({ where: { usuarioEmail: { startsWith: 'e2e-aus-' } } });
      await tx.trabajador.deleteMany({ where: { id: { in: trabajadores.map((t) => t.id) } } });
      await tx.usuario.deleteMany({ where: { email: { startsWith: 'e2e-aus-' } } });
    });
    for (const id of ids) {
      await rm(join(process.cwd(), 'uploads', 'sst', 'ausentismo', id), { recursive: true, force: true });
    }
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
      throw new Error('Esta prueba limpia con los triggers desactivados: solo corre contra una base de datos local');
    }
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    await limpiar();

    tipoGeneralId = (await prisma.tipoAusentismo.findUniqueOrThrow({ where: { codigo: 'ENFERMEDAD_GENERAL' } })).id;
    tipoLutoId = (await prisma.tipoAusentismo.findUniqueOrThrow({ where: { codigo: 'LUTO' } })).id;
    diagnosticoId = (await prisma.diagnosticoCie10.findUniqueOrThrow({ where: { codigo: 'M54.5' } })).id;
    const trabajador = await prisma.trabajador.create({
      data: { nombre: 'Persona Inventada', documento: `E2E-AUS-${Date.now()}`, cargo: 'Oficial', salarioBase: SALARIO_DE_PRUEBA, fechaIngreso: new Date(2026, 0, 1) },
    });
    trabajadorId = trabajador.id;

    const casos: [clave: string, rolClave: string, limitado: boolean][] = [
      ['GERENTE', 'GERENTE', false],
      ['ADMINISTRADOR', 'ADMINISTRADOR', false],
      ['CONTRATISTA', 'CONTRATISTA_SST', false],
      ['CONSULTA', 'CONSULTA', false],
      ['CONSULTA_LIMITADA', 'CONSULTA', true],
    ];
    for (const [clave, rolClave, limitado] of casos) {
      const rol = await prisma.rolUsuario.findUniqueOrThrow({ where: { clave: rolClave } });
      const usuario = await prisma.usuario.create({
        data: { nombre: `Prueba ${clave}`, email: CORREO(clave), passwordHash: 'no-sirve-para-ingresar', rolId: rol.id, todosLosProyectos: !limitado },
      });
      tokens[clave] = await jwt.signAsync({ sub: usuario.id });
    }
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  const como = (clave: string) => ({
    get: (ruta: string) => request(app.getHttpServer()).get(ruta).set('Authorization', `Bearer ${tokens[clave]}`),
    post: (ruta: string) => request(app.getHttpServer()).post(ruta).set('Authorization', `Bearer ${tokens[clave]}`),
    patch: (ruta: string) => request(app.getHttpServer()).patch(ruta).set('Authorization', `Bearer ${tokens[clave]}`),
  });

  const consultasDeDiagnostico = (clave: string) =>
    prisma.registroAuditoria.count({ where: { usuarioEmail: CORREO(clave), accion: 'AUSENTISMO_DIAGNOSTICO_CONSULTAR' } });

  const registro = (extra: Record<string, unknown> = {}) => ({
    trabajadorId,
    tipoId: tipoGeneralId,
    fechaInicio: '2026-03-10',
    fechaFin: '2026-03-14',
    diagnosticoId,
    numeroDocumento: 'INC-E2E-1',
    observaciones: 'Cirugía de columna programada',
    ...extra,
  });

  it('sin sesión no se entra', async () => {
    await request(app.getHttpServer()).get('/sst/ausentismo').expect(401);
  });

  describe('registro y lectura según el rol', () => {
    it('el administrador registra la incapacidad con el CIE-10, pero la respuesta no trae el diagnóstico ni las observaciones', async () => {
      const { body, text } = await como('ADMINISTRADOR').post('/sst/ausentismo').send(registro()).expect(201);
      primero = body.id;
      expect(body).toMatchObject({ dias: 5, anio: 2026, mes: 3, cargoFoto: 'Oficial', esProrroga: false, diasPrevios: 0 });
      expect(body.totales).toMatchObject({ dias: 5, diasEmpleador: 2, diasEps: 3 });
      // Ve los valores: el administrador es de nómina.
      expect(body.salarioFoto).toBe('3333333');
      expect(body.totales.valorEps).toBeDefined();
      expect(text).not.toContain('M54.5');
      expect(text).not.toContain('Lumbago');
      expect(text).not.toContain('Cirugía');
      expect(body).not.toHaveProperty('diagnostico');
      expect(body).not.toHaveProperty('diagnosticoId');
    });

    it('queda el recobro de la EPS pendiente y el período del mes', async () => {
      const { body } = await como('GERENTE').get(`/sst/ausentismo/${primero}`).expect(200);
      expect(body.recobros).toHaveLength(1);
      expect(body.recobros[0]).toMatchObject({ entidad: 'EPS', estado: 'PENDIENTE' });
      expect(body.periodos).toHaveLength(1);
      expect(body.periodos[0]).toMatchObject({ anio: 2026, mes: 3, dias: 5 });
    });

    it('el gerente ve el diagnóstico y los valores, y la consulta del diagnóstico queda en la auditoría', async () => {
      const antes = await consultasDeDiagnostico('GERENTE');
      const { body } = await como('GERENTE').get(`/sst/ausentismo/${primero}`).expect(200);
      expect(body.diagnostico).toMatchObject({ codigo: 'M54.5' });
      expect(body.observaciones).toBe('Cirugía de columna programada');
      expect(body.salarioFoto).toBe('3333333');
      expect(await consultasDeDiagnostico('GERENTE')).toBe(antes + 1);
    });

    it('el contratista SST ve el diagnóstico pero ningún valor, y su consulta también queda en la auditoría', async () => {
      const antes = await consultasDeDiagnostico('CONTRATISTA');
      const { body, text } = await como('CONTRATISTA').get(`/sst/ausentismo/${primero}`).expect(200);
      expect(body.diagnostico).toMatchObject({ codigo: 'M54.5' });
      expect(await consultasDeDiagnostico('CONTRATISTA')).toBe(antes + 1);
      // Ningún valor, por ningún camino: ni el salario, ni el valor diario, ni lo que paga cada pagador, ni los recobros.
      expect(text).not.toContain(SALARIO_DE_PRUEBA);
      expect(text).not.toMatch(/salarioFoto|baseDiaria|pisoDiario|parametrosLiquidacion|liquidacionCalculada|valorEps|valorEmpleador|valorReconocido/);
      // Pero sí los días de cada pagador.
      expect(body.periodos[0]).toMatchObject({ diasEmpleador: 2, diasEps: 3 });
      expect(body.totales).toMatchObject({ dias: 5, diasEps: 3 });
    });

    it('el administrador ve los valores pero no el diagnóstico y no genera consultas de diagnóstico', async () => {
      const { body, text } = await como('ADMINISTRADOR').get(`/sst/ausentismo/${primero}`).expect(200);
      expect(body.salarioFoto).toBe('3333333');
      expect(text).not.toMatch(/M54\.5|Lumbago|Cirugía/);
      for (const campo of ['diagnostico', 'diagnosticoId', 'observaciones', 'documentos']) {
        expect(body, campo).not.toHaveProperty(campo);
      }
      expect(body._count).not.toHaveProperty('documentos');
      expect(await consultasDeDiagnostico('ADMINISTRADOR')).toBe(0);
    });

    it('Consulta (con o sin límite de proyectos) no entra a nada del ausentismo', async () => {
      for (const clave of ['CONSULTA', 'CONSULTA_LIMITADA']) {
        await como(clave).get('/sst/ausentismo').expect(403);
        await como(clave).get(`/sst/ausentismo/${primero}`).expect(403);
        await como(clave).get(`/sst/ausentismo/${primero}/documentos`).expect(403);
        await como(clave).post('/sst/ausentismo').send(registro()).expect(403);
        await como(clave).post(`/sst/ausentismo/${primero}/anular`).send({ motivo: 'No debería poder' }).expect(403);
        await como(clave).post(`/sst/ausentismo/${primero}/correccion`).send({ motivo: 'No debería poder', periodos: [] }).expect(403);
      }
    });

    it('la lista nunca trae el diagnóstico, ni siquiera para el gerente; y al contratista no le trae valores', async () => {
      for (const clave of ['GERENTE', 'ADMINISTRADOR', 'CONTRATISTA']) {
        const { body, text } = await como(clave).get(`/sst/ausentismo?trabajadorId=${trabajadorId}`).expect(200);
        expect(body).toHaveLength(1);
        expect(text, clave).not.toMatch(/M54\.5|Lumbago|Cirugía/);
        for (const campo of ['diagnostico', 'diagnosticoId', 'observaciones', 'liquidacionCalculada', 'parametrosLiquidacion']) {
          expect(body[0], `${clave}: ${campo}`).not.toHaveProperty(campo);
        }
        expect(body[0]).toMatchObject({ id: primero, dias: 5, trabajador: { id: trabajadorId }, tipo: { codigo: 'ENFERMEDAD_GENERAL' } });
      }
      const contratista = await como('CONTRATISTA').get(`/sst/ausentismo?trabajadorId=${trabajadorId}`).expect(200);
      expect(contratista.text).not.toMatch(/valorEps|valorEmpleador|valorReconocido|salarioFoto/);
      const gerente = await como('GERENTE').get(`/sst/ausentismo?trabajadorId=${trabajadorId}`).expect(200);
      expect(gerente.body[0].totales.valorEps).toBeDefined();
    });

    it('la lista filtra por mes y por estado', async () => {
      expect((await como('GERENTE').get(`/sst/ausentismo?trabajadorId=${trabajadorId}&anio=2026&mes=3`).expect(200)).body).toHaveLength(1);
      expect((await como('GERENTE').get(`/sst/ausentismo?trabajadorId=${trabajadorId}&anio=2026&mes=4`).expect(200)).body).toHaveLength(0);
      expect((await como('GERENTE').get(`/sst/ausentismo?trabajadorId=${trabajadorId}&estado=ANULADOS`).expect(200)).body).toHaveLength(0);
      await como('GERENTE').get('/sst/ausentismo?mes=13').expect(400);
    });
  });

  describe('certificados adjuntos', () => {
    it('quien registra puede adjuntar el certificado aunque no vea diagnósticos, pero no puede leerlo', async () => {
      const subida = await como('ADMINISTRADOR').post(`/sst/ausentismo/${primero}/documentos`).field('descripcion', 'Certificado de la EPS').attach('documento', PNG, 'certificado.png').expect(201);
      expect(subida.body.nombreOriginal).toBe('certificado.png');
      await como('ADMINISTRADOR').get(`/sst/ausentismo/${primero}/documentos`).expect(403);
      await como('ADMINISTRADOR').get(`/sst/ausentismo/${primero}/documentos/${subida.body.id}`).expect(403);
    });

    it('el contratista y el gerente lo leen, y cada lectura queda en la auditoría', async () => {
      const lista = await como('CONTRATISTA').get(`/sst/ausentismo/${primero}/documentos`).expect(200);
      expect(lista.body).toHaveLength(1);
      const antes = await consultasDeDiagnostico('CONTRATISTA');
      const descarga = await como('CONTRATISTA').get(`/sst/ausentismo/${primero}/documentos/${lista.body[0].id}`).expect(200);
      expect(descarga.headers['content-type']).toContain('image/png');
      expect(descarga.headers['x-content-type-options']).toBe('nosniff');
      expect(await consultasDeDiagnostico('CONTRATISTA')).toBe(antes + 1);
      await como('GERENTE').get(`/sst/ausentismo/${primero}/documentos/${lista.body[0].id}`).expect(200);
    });

    it('un archivo que no es PDF ni imagen se rechaza', async () => {
      await como('ADMINISTRADOR').post(`/sst/ausentismo/${primero}/documentos`).attach('documento', Buffer.from('texto cualquiera'), 'nota.txt').expect(400);
    });

    it('con un documento de otro registro no se llega al certificado', async () => {
      const lista = await como('GERENTE').get(`/sst/ausentismo/${primero}/documentos`).expect(200);
      await como('GERENTE').get(`/sst/ausentismo/00000000-0000-4000-8000-000000000000/documentos/${lista.body[0].id}`).expect(404);
    });
  });

  describe('reglas de registro', () => {
    it('no admite un traslape con otro ausentismo vigente del mismo trabajador', async () => {
      const { body } = await como('ADMINISTRADOR').post('/sst/ausentismo').send(registro({ fechaInicio: '2026-03-14', fechaFin: '2026-03-16' })).expect(409);
      expect(body.message).toMatch(/ya tiene un ausentismo en esas fechas/);
    });

    it('una incapacidad exige el diagnóstico y una licencia no', async () => {
      await como('ADMINISTRADOR').post('/sst/ausentismo').send(registro({ fechaInicio: '2026-05-04', fechaFin: '2026-05-06', diagnosticoId: undefined })).expect(400);
      const luto = await como('ADMINISTRADOR').post('/sst/ausentismo').send({ trabajadorId, tipoId: tipoLutoId, fechaInicio: '2026-05-04', fechaFin: '2026-05-06' }).expect(201);
      expect(luto.body.totales).toMatchObject({ dias: 3, diasEmpleador: 3 });
      expect(luto.body.recobros).toHaveLength(0);
    });

    it('rechaza fechas desordenadas, un día que no existe y un trabajador que no existe', async () => {
      await como('ADMINISTRADOR').post('/sst/ausentismo').send(registro({ fechaInicio: '2026-06-10', fechaFin: '2026-06-01' })).expect(400);
      await como('ADMINISTRADOR').post('/sst/ausentismo').send(registro({ fechaInicio: '2026-02-30', fechaFin: '2026-03-02' })).expect(400);
      await como('ADMINISTRADOR').post('/sst/ausentismo').send(registro({ trabajadorId: '00000000-0000-4000-8000-000000000000', fechaInicio: '2026-07-01', fechaFin: '2026-07-02' })).expect(404);
    });

    it('la prórroga continúa la incapacidad anterior y cuenta sus días para los tramos', async () => {
      const { body } = await como('ADMINISTRADOR')
        .post('/sst/ausentismo')
        .send(registro({ fechaInicio: '2026-03-15', fechaFin: '2026-03-20', esProrroga: true, prorrogaDeId: primero, numeroDocumento: 'INC-E2E-2' }))
        .expect(201);
      prorroga = body.id;
      expect(body).toMatchObject({ esProrroga: true, prorrogaDeId: primero, diasPrevios: 5 });
      // Ya pasó el día a cargo del empleador: los 6 días los paga la EPS.
      expect(body.totales).toMatchObject({ dias: 6, diasEmpleador: 0, diasEps: 6 });
    });

    it('una incapacidad con una prórroga vigente no se anula; primero la prórroga', async () => {
      const { body } = await como('ADMINISTRADOR').post(`/sst/ausentismo/${primero}/anular`).send({ motivo: 'Registrada por error' }).expect(409);
      expect(body.message).toMatch(/prórrogas vigentes/);
    });
  });

  describe('cambios', () => {
    it('se completa el número y las observaciones; las fechas no se cambian', async () => {
      const { body } = await como('CONTRATISTA').patch(`/sst/ausentismo/${prorroga}`).send({ numeroDocumento: 'INC-E2E-2B', observaciones: 'Control en 8 días' }).expect(200);
      expect(body.numeroDocumento).toBe('INC-E2E-2B');
      // La API ni siquiera acepta las fechas: forbidNonWhitelisted.
      await como('CONTRATISTA').patch(`/sst/ausentismo/${prorroga}`).send({ fechaFin: '2026-03-25' }).expect(400);
    });

    it('el contratista puede registrar y anular, pero no corregir la liquidación (no ve los valores)', async () => {
      await como('CONTRATISTA').post(`/sst/ausentismo/${prorroga}/correccion`).send({ motivo: 'La EPS pagó otro valor', periodos: [] }).expect(403);
    });

    it('el administrador corrige la liquidación con motivo; la auditoría guarda el antes y el después', async () => {
      const { body: antes } = await como('GERENTE').get(`/sst/ausentismo/${prorroga}`).expect(200);
      const periodo = antes.periodos[0];
      await como('ADMINISTRADOR').post(`/sst/ausentismo/${prorroga}/correccion`).send({ motivo: 'x', periodos: [] }).expect(400);
      // Días que no suman el total del mes.
      await como('ADMINISTRADOR')
        .post(`/sst/ausentismo/${prorroga}/correccion`)
        .send({ motivo: 'La EPS reconoció 400.000', periodos: [{ anio: 2026, mes: 3, diasEmpleador: 0, diasEps: 9, diasArl: 0, diasAfp: 0, diasLaborados: 0, diasDescuento: 0, valorEmpleador: '0', valorEps: '400000', valorArl: '0', valorAfp: '0', valorDescuento: '0' }] })
        .expect(400);
      const corregido = await como('ADMINISTRADOR')
        .post(`/sst/ausentismo/${prorroga}/correccion`)
        .send({ motivo: 'La EPS reconoció 400.000', periodos: [{ anio: 2026, mes: 3, diasEmpleador: 0, diasEps: 6, diasArl: 0, diasAfp: 0, diasLaborados: 0, diasDescuento: 0, valorEmpleador: '0', valorEps: '400000', valorArl: '0', valorAfp: '0', valorDescuento: '0' }] })
        .expect(201);
      expect(corregido.body).toMatchObject({ corregida: true, motivoCorreccion: 'La EPS reconoció 400.000' });
      expect(corregido.body.totales.valorEps).toBe('400000');
      // El cálculo original sigue guardado.
      const guardado = await prisma.ausentismo.findUniqueOrThrow({ where: { id: prorroga } });
      expect((guardado.liquidacionCalculada as { totales: { valorEps: string } }).totales.valorEps).toBe(antes.totales.valorEps);
      expect(periodo.valorEps).toBe(antes.totales.valorEps);
      const auditoria = await prisma.registroAuditoria.findFirstOrThrow({ where: { usuarioEmail: CORREO('ADMINISTRADOR'), accion: 'AUSENTISMO_CORREGIR' } });
      expect(JSON.stringify(auditoria.antes)).toContain(antes.totales.valorEps);
      expect(JSON.stringify(auditoria.despues)).toContain('400000');
    });

    it('anular exige un motivo y deja el registro anulado, sin modificar después', async () => {
      await como('ADMINISTRADOR').post(`/sst/ausentismo/${prorroga}/anular`).send({ motivo: 'no' }).expect(400);
      const { body } = await como('ADMINISTRADOR').post(`/sst/ausentismo/${prorroga}/anular`).send({ motivo: 'Registrada por error' }).expect(201);
      expect(body).toMatchObject({ anulada: true, motivoAnulacion: 'Registrada por error' });
      await como('ADMINISTRADOR').patch(`/sst/ausentismo/${prorroga}`).send({ observaciones: 'x' }).expect(400);
      // Ahora sí se puede anular la incapacidad anterior, y su fecha queda libre.
      await como('ADMINISTRADOR').post(`/sst/ausentismo/${primero}/anular`).send({ motivo: 'Registrada por error' }).expect(201);
      expect((await como('GERENTE').get(`/sst/ausentismo?trabajadorId=${trabajadorId}&estado=ANULADOS`).expect(200)).body).toHaveLength(2);
      await como('ADMINISTRADOR').post('/sst/ausentismo').send(registro({ fechaInicio: '2026-03-12', fechaFin: '2026-03-13' })).expect(201);
    });
  });

  it('cada acción sobre el ausentismo quedó en la auditoría con quién la hizo', async () => {
    const acciones = await prisma.registroAuditoria.findMany({ where: { usuarioEmail: { startsWith: 'e2e-aus-' }, entidad: 'AUSENTISMO' }, select: { accion: true } });
    const nombres = new Set(acciones.map((a) => a.accion));
    for (const accion of ['AUSENTISMO_REGISTRAR', 'AUSENTISMO_EDITAR', 'AUSENTISMO_ANULAR', 'AUSENTISMO_CORREGIR', 'AUSENTISMO_DIAGNOSTICO_CONSULTAR']) {
      expect(nombres.has(accion), accion).toBe(true);
    }
    // Ningún registro de auditoría del ausentismo contiene el diagnóstico ni las observaciones.
    const todo = await prisma.registroAuditoria.findMany({ where: { usuarioEmail: { startsWith: 'e2e-aus-' }, entidad: 'AUSENTISMO' } });
    expect(JSON.stringify(todo)).not.toMatch(/M54\.5|Lumbago|Cirugía/);
  });
});
