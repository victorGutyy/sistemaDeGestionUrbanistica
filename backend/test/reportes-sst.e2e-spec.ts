// Prueba de punta a punta de los reportes de SST (CC-03 fase D, RF-SST-22): arranca la app completa con los guardas reales y
// entra con un token de cada rol. Fija lo más importante: quién ve qué dentro de cada reporte (los valores del ausentismo solo
// con sst.valores_ver; el diagnóstico y las observaciones, nunca, ni para el gerente: RNF-SEG-08), que Consulta no entra y que
// bajar un reporte deja rastro en la auditoría.
//
// Requiere Postgres arriba y backend/.env, y SOLO corre contra una base de datos local. Los registros de ausentismo, EPP y
// capacitaciones no se pueden borrar (la base lo impide), así que esta prueba limpia al terminar desactivando los triggers de
// protección dentro de una transacción de su propia sesión. Todo lo que crea tiene datos inventados.
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const CORREO = (clave: string) => `e2e-rsst-${clave.toLowerCase()}@ejemplo.test`;
const PREFIJO = 'E2E-RSST';
const ANIO_DEL_PLAN = 2095;
const DIAGNOSTICO_SENTINELA = /M54|Lumbago|Cirug[ií]a de columna/i;
const ROLES_CON_ACCESO = ['GERENTE', 'ADMINISTRADOR', 'CONTRATISTA'] as const;
const CLAVES = ['sst-ausentismo-resumen', 'sst-ausentismo-detalle', 'sst-epp', 'sst-plan', 'sst-capacitaciones'] as const;

describe('Reportes de SST por rol, con los guardas reales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let trabajadorId: string;
  const tokens: Record<string, string> = {};

  async function limpiar() {
    const trabajadores = await prisma.trabajador.findMany({ where: { documento: { startsWith: PREFIJO } }, select: { id: true } });
    const idsTrabajador = trabajadores.map((t) => t.id);
    const ausentismos = await prisma.ausentismo.findMany({ where: { trabajadorId: { in: idsTrabajador } }, select: { id: true } });
    const idsAusentismo = ausentismos.map((a) => a.id);
    await prisma.$transaction(async (tx) => {
      // Solo para limpiar los datos de esta prueba: estos registros no se pueden borrar de otro modo.
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.recobroAusentismo.deleteMany({ where: { ausentismoId: { in: idsAusentismo } } });
      await tx.ausentismoPeriodo.deleteMany({ where: { ausentismoId: { in: idsAusentismo } } });
      await tx.ausentismo.deleteMany({ where: { id: { in: idsAusentismo } } });
      await tx.entregaEpp.deleteMany({ where: { trabajadorId: { in: idsTrabajador } } });
      await tx.elementoEpp.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
      await tx.actividadPlan.deleteMany({ where: { actividad: { startsWith: PREFIJO } } });
      await tx.capacitacion.deleteMany({ where: { tema: { startsWith: PREFIJO } } });
      await tx.registroAuditoria.deleteMany({ where: { usuarioEmail: { startsWith: 'e2e-rsst-' } } });
      await tx.trabajador.deleteMany({ where: { id: { in: idsTrabajador } } });
      await tx.usuario.deleteMany({ where: { email: { startsWith: 'e2e-rsst-' } } });
    });
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

    trabajadorId = (
      await prisma.trabajador.create({ data: { nombre: 'Persona Inventada Reportes', documento: `${PREFIJO}-${Date.now()}`, cargo: 'Oficial', salarioBase: '3333333', fechaIngreso: new Date(2026, 0, 1) } })
    ).id;

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

    // Los datos que los reportes van a mostrar, creados como los crea la aplicación (por sus rutas).
    // El ausentismo va en agosto de 2026: la prueba ausentismo.e2e-spec.ts cuenta los de marzo y mayo de toda la empresa y los archivos
    // corren en paralelo, así que aquí no se puede tocar ninguno de esos meses.
    const tipoId = (await prisma.tipoAusentismo.findUniqueOrThrow({ where: { codigo: 'ENFERMEDAD_GENERAL' } })).id;
    const diagnosticoId = (await prisma.diagnosticoCie10.findUniqueOrThrow({ where: { codigo: 'M54.5' } })).id;
    await como('ADMINISTRADOR')
      .post('/sst/ausentismo')
      .send({ trabajadorId, tipoId, fechaInicio: '2026-08-10', fechaFin: '2026-08-14', diagnosticoId, numeroDocumento: 'INC-RSST-1', observaciones: 'Cirugía de columna programada' })
      .expect(201);

    const elemento = await como('GERENTE').post('/sst/epp/elementos').send({ nombre: `${PREFIJO} casco`, vidaUtilDias: 365 }).expect(201);
    await como('ADMINISTRADOR').post('/sst/epp/entregas').send({ trabajadorId, elementoId: elemento.body.id, fecha: '2026-03-05', cantidad: 2, tallaReferencia: 'M', motivo: 'DOTACION_INICIAL' }).expect(201);

    await como('ADMINISTRADOR')
      .post('/sst/plan')
      .send({ anio: ANIO_DEL_PLAN, ciclo: 'PLANEAR', estandar: '1.1.1', actividad: `${PREFIJO} definir responsable`, meta: '100 %', responsable: 'Responsable Inventado', correoResponsable: 'responsable@ejemplo.test', fechaInicio: `${ANIO_DEL_PLAN}-02-01`, fechaFin: `${ANIO_DEL_PLAN}-02-28`, presupuesto: '500000' })
      .expect(201);
    await como('ADMINISTRADOR')
      .post('/sst/capacitaciones')
      .send({ tema: `${PREFIJO} alturas`, objetivo: 'Prevenir caídas', dirigidoA: 'Todos', modalidad: 'PRESENCIAL', horas: 2, fechaProgramada: `${ANIO_DEL_PLAN}-04-10`, responsable: 'Facilitador Inventado', correoResponsable: 'facilitador@ejemplo.test', ejecutor: 'ARL', asistentesProgramados: 10 })
      .expect(201);
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  const como = (clave: string) => ({
    get: (ruta: string) => request(app.getHttpServer()).get(ruta).set('Authorization', `Bearer ${tokens[clave]}`),
    post: (ruta: string) => request(app.getHttpServer()).post(ruta).set('Authorization', `Bearer ${tokens[clave]}`),
  });

  // Respuesta binaria (PDF o Excel) como Buffer.
  const binario = (clave: string, ruta: string) =>
    como(clave)
      .get(ruta)
      .buffer(true)
      .parse((res, devolver) => {
        const partes: Buffer[] = [];
        res.on('data', (parte: Buffer) => partes.push(parte));
        res.on('end', () => devolver(null, Buffer.concat(partes)));
      });

  const consulta = (clave: (typeof CLAVES)[number]) => {
    const filtros: Record<(typeof CLAVES)[number], string> = {
      'sst-ausentismo-resumen': 'anio=2026',
      'sst-ausentismo-detalle': `anio=2026&mes=8&trabajadorId=${trabajadorId}`,
      'sst-epp': `trabajadorId=${trabajadorId}&desde=2026-03-01&hasta=2026-03-31`,
      'sst-plan': `anio=${ANIO_DEL_PLAN}`,
      'sst-capacitaciones': `anio=${ANIO_DEL_PLAN}`,
    };
    return `/sst/reportes/${clave}?${filtros[clave]}`;
  };
  const exportaciones = (usuario: string) => prisma.registroAuditoria.count({ where: { usuarioEmail: CORREO(usuario), accion: 'SST_REPORTE_EXPORTAR' } });

  it('sin sesión no se entra', async () => {
    await request(app.getHttpServer()).get('/sst/reportes').expect(401);
    await request(app.getHttpServer()).get(consulta('sst-plan')).expect(401);
    await request(app.getHttpServer()).get('/sst/reportes/sst-plan/exportar?formato=pdf').expect(401);
  });

  describe('quién entra', () => {
    it('gerente, administrador y contratista ven el catálogo con los cinco reportes y las opciones', async () => {
      for (const rol of ROLES_CON_ACCESO) {
        const { body } = await como(rol).get('/sst/reportes').expect(200);
        expect(body.reportes.map((r: { clave: string }) => r.clave)).toEqual([...CLAVES]);
        expect(body.opciones.trabajadores.some((t: { id: string }) => t.id === trabajadorId)).toBe(true);
        expect(body.opciones.tiposAusentismo.length).toBeGreaterThan(0);
        expect(body.opciones.estadosActividad).toHaveLength(5);
      }
    });

    it('Consulta, con o sin límite de proyectos, no entra a nada', async () => {
      for (const rol of ['CONSULTA', 'CONSULTA_LIMITADA']) {
        await como(rol).get('/sst/reportes').expect(403);
        for (const clave of CLAVES) {
          await como(rol).get(consulta(clave)).expect(403);
          await como(rol).get(`/sst/reportes/${clave}/exportar?formato=excel`).expect(403);
        }
      }
    });

    it('los tres roles reciben cada uno de los cinco reportes', async () => {
      for (const rol of ROLES_CON_ACCESO) {
        for (const clave of CLAVES) {
          const { body } = await como(rol).get(consulta(clave)).expect(200);
          expect(body.clave, `${rol} ${clave}`).toBe(clave);
          expect(body.secciones.length, `${rol} ${clave}`).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('lo que dice cada reporte', () => {
    it('el detalle del ausentismo trae el registro con sus días por pagador', async () => {
      const { body } = await como('ADMINISTRADOR').get(consulta('sst-ausentismo-detalle')).expect(200);
      const [seccion] = body.secciones;
      expect(seccion.filas).toHaveLength(1);
      expect(seccion.filas[0]).toMatchObject({ trabajador: 'Persona Inventada Reportes', numeroDocumento: 'INC-RSST-1', tipo: 'Enfermedad general', desde: '2026-08-10', hasta: '2026-08-14', estado: 'Vigente', dias: 5, diasEmpleador: 2, diasEps: 3 });
      expect(seccion.totales).toMatchObject({ dias: 5 });
      expect(body.filtros.map((f: { etiqueta: string }) => f.etiqueta)).toEqual(['Año', 'Mes', 'Trabajador']);
    });

    it('el resumen mensual cuenta el ausentismo en agosto y en el total del año', async () => {
      const { body } = await como('GERENTE').get(consulta('sst-ausentismo-resumen')).expect(200);
      const [mensual] = body.secciones;
      expect(mensual.filas).toHaveLength(12);
      expect(mensual.filas[7]).toMatchObject({ mes: 'Agosto' });
      expect(mensual.filas[7].dias).toBeGreaterThanOrEqual(5);
      expect(mensual.totales.mes).toBe('Total del año');
    });

    it('EPP: la entrega del trabajador y el elemento en su estado de reposición', async () => {
      const { body } = await como('CONTRATISTA').get(consulta('sst-epp')).expect(200);
      expect(body.secciones[0].filas).toEqual([expect.objectContaining({ elemento: `${PREFIJO} casco`, cantidad: 2, talla: 'M', motivo: 'Dotación inicial', firmo: 'No' })]);
      expect(body.secciones[1].titulo).toBe('Por reponer y vencidos');
    });

    it('plan y capacitaciones del año de prueba, con su resumen', async () => {
      const plan = (await como('CONTRATISTA').get(consulta('sst-plan')).expect(200)).body;
      expect(plan.secciones[0].filas[0]).toMatchObject({ total: 1, programadas: 1, ejecutadas: 0, cumplimiento: '0 %' });
      expect(plan.secciones[1].filas[0]).toMatchObject({ ciclo: 'Planear', actividad: `${PREFIJO} definir responsable`, estado: 'Programada', presupuesto: '500000' });
      const capacitaciones = (await como('GERENTE').get(consulta('sst-capacitaciones')).expect(200)).body;
      expect(capacitaciones.secciones[0].filas[0]).toMatchObject({ total: 1, ejecutadas: 0, cobertura: null });
      expect(capacitaciones.secciones[1].filas[0]).toMatchObject({ tema: `${PREFIJO} alturas`, modalidad: 'Presencial', programados: 10, reales: 0 });
    });

    it('el estado filtra el plan', async () => {
      const { body } = await como('GERENTE').get(`${consulta('sst-plan')}&estado=EJECUTADA`).expect(200);
      expect(body.secciones[1].filas).toEqual([]);
    });
  });

  describe('qué ve cada rol dentro del reporte (RNF-SEG-08)', () => {
    it('el diagnóstico y las observaciones no salen en ningún reporte, para ningún rol, ni en el JSON ni en el Excel ni en el PDF', async () => {
      for (const rol of ROLES_CON_ACCESO) {
        for (const clave of CLAVES) {
          const { text } = await como(rol).get(consulta(clave)).expect(200);
          expect(text, `${rol} ${clave}`).not.toMatch(DIAGNOSTICO_SENTINELA);
        }
        const excel = await binario(rol, `/sst/reportes/sst-ausentismo-detalle/exportar?formato=excel&anio=2026&trabajadorId=${trabajadorId}`).expect(200);
        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(excel.body as Buffer as unknown as ArrayBuffer);
        expect(JSON.stringify(libro.worksheets.map((h) => h.getSheetValues())), `${rol} excel`).not.toMatch(DIAGNOSTICO_SENTINELA);
        const pdf = await binario(rol, `/sst/reportes/sst-ausentismo-detalle/exportar?formato=pdf&anio=2026&trabajadorId=${trabajadorId}`).expect(200);
        expect((pdf.body as Buffer).toString('latin1'), `${rol} pdf`).not.toMatch(DIAGNOSTICO_SENTINELA);
      }
    }, 60_000);

    it('el administrador y el gerente ven los valores del ausentismo', async () => {
      for (const rol of ['ADMINISTRADOR', 'GERENTE']) {
        const detalle = (await como(rol).get(consulta('sst-ausentismo-detalle')).expect(200)).body.secciones;
        expect(detalle, rol).toHaveLength(2);
        expect(detalle[1].columnas.map((c: { clave: string }) => c.clave), rol).toEqual(expect.arrayContaining(['valorEmpleador', 'valorEps']));
        expect(Number(detalle[1].filas[0].valorEps), rol).toBeGreaterThan(0);
        const resumen = (await como(rol).get(consulta('sst-ausentismo-resumen')).expect(200)).body.secciones;
        expect(resumen[1].titulo, rol).toBe('Valores por mes');
        expect(resumen[1].columnas.map((c: { clave: string }) => c.clave), rol).toContain('valorEps');
      }
    });

    it('el contratista ve los días pero ningún valor: ni columnas ni números, en pantalla ni en el Excel', async () => {
      const detalle = (await como('CONTRATISTA').get(consulta('sst-ausentismo-detalle')).expect(200)).body;
      expect(detalle.secciones).toHaveLength(1);
      expect(detalle.secciones[0].columnas.map((c: { clave: string }) => c.clave).filter((c: string) => c.startsWith('valor'))).toEqual([]);
      expect(detalle.secciones[0].filas[0]).toMatchObject({ dias: 5, diasEps: 3 });
      expect(JSON.stringify(detalle)).not.toMatch(/valorEmpleador|valorEps|valorArl|valorAfp|valorDescuento|salario/i);
      const resumen = (await como('CONTRATISTA').get(consulta('sst-ausentismo-resumen')).expect(200)).text;
      expect(resumen).not.toMatch(/valorEmpleador|valorEps|valorArl|valorAfp|valorDescuento|salario/i);

      const excel = await binario('CONTRATISTA', `/sst/reportes/sst-ausentismo-detalle/exportar?formato=excel&anio=2026&trabajadorId=${trabajadorId}`).expect(200);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(excel.body as Buffer as unknown as ArrayBuffer);
      expect(JSON.stringify(libro.worksheets.map((h) => h.getSheetValues()))).not.toMatch(/Valores liquidados|Valores por mes/);
    });
  });

  describe('exportar a PDF y Excel', () => {
    it('el PDF y el Excel de cada reporte salen bien y cada descarga queda en la auditoría', async () => {
      const antes = await exportaciones('ADMINISTRADOR');
      for (const clave of CLAVES) {
        const [ruta, filtros] = consulta(clave).split('?');
        const pdf = await binario('ADMINISTRADOR', `${ruta}/exportar?${filtros}&formato=pdf`).expect(200);
        expect(pdf.headers['content-type']).toBe('application/pdf');
        expect(pdf.headers['content-disposition']).toContain(`${clave}-`);
        expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

        const excel = await binario('ADMINISTRADOR', `${ruta}/exportar?${filtros}&formato=excel`).expect(200);
        expect(excel.headers['content-type']).toContain('spreadsheetml.sheet');
        expect(excel.headers['content-disposition']).toContain('.xlsx');
        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(excel.body as Buffer as unknown as ArrayBuffer);
        expect(libro.worksheets.length, clave).toBeGreaterThan(0);
      }
      expect(await exportaciones('ADMINISTRADOR')).toBe(antes + CLAVES.length * 2);
    }, 60_000);

    it('verlo en pantalla no deja rastro de descarga', async () => {
      const antes = await exportaciones('GERENTE');
      await como('GERENTE').get(consulta('sst-ausentismo-detalle')).expect(200);
      expect(await exportaciones('GERENTE')).toBe(antes);
    });

    it('el rastro dice quién bajó qué', async () => {
      const registro = await prisma.registroAuditoria.findFirstOrThrow({ where: { usuarioEmail: CORREO('ADMINISTRADOR'), accion: 'SST_REPORTE_EXPORTAR' }, orderBy: { createdAt: 'desc' } });
      expect(registro.entidad).toBe('EXPORTACION');
      expect(registro.resumen).toMatch(/Descargó el reporte ".+" en (PDF|Excel)/);
    });
  });

  describe('filtros mal pedidos', () => {
    it('un reporte que no existe da 404, también el de otro catálogo', async () => {
      await como('GERENTE').get('/sst/reportes/sst-inventado').expect(404);
      await como('GERENTE').get('/sst/reportes/recaudo').expect(404);
      await como('GERENTE').get('/sst/reportes/sst-inventado/exportar?formato=pdf').expect(404);
    });

    it('rechaza lo que no tiene sentido y no baja nada', async () => {
      const antes = await exportaciones('GERENTE');
      await como('GERENTE').get('/sst/reportes/sst-plan?anio=1900').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-ausentismo-detalle?mes=13').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-ausentismo-detalle?trabajadorId=no-es-uuid').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-epp?desde=2026-03-31&hasta=2026-03-01').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-epp?desde=31-03-2026').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-plan?estado=VIGENTES').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-ausentismo-detalle?estado=EJECUTADA').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-plan?inventado=1').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-plan/exportar').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-plan/exportar?formato=docx').expect(400);
      await como('GERENTE').get('/sst/reportes/sst-plan/exportar?formato=pdf&estado=VIGENTES').expect(400);
      expect(await exportaciones('GERENTE')).toBe(antes);
    });
  });
});
