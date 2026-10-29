// Prueba de punta a punta de la carga de SST desde Excel (CC-03 fase D.3, RF-SST-23): arranca la app completa con los guardas reales,
// entra con un token de cada rol y carga archivos de verdad. Fija lo más importante: solo el gerente carga; la prueba previa NO
// guarda nada (ni una fila buena); la confirmación es todo o nada; cada fila pasa por las reglas de siempre (traslape, tipo,
// diagnóstico, parámetros del año, catálogos); el mismo archivo no se carga dos veces; y la carga de SST no se mezcla con la lista
// de importaciones de ventas.
//
// Requiere Postgres arriba y backend/.env, y SOLO corre contra una base de datos local. Los trabajadores, ausentismos, entregas y
// asistencias no se pueden borrar (la base lo impide), así que esta prueba limpia al terminar desactivando los triggers de
// protección dentro de una transacción de su propia sesión. Todo lo que crea tiene datos inventados.
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { HOJAS_SST, type ClaveHojaSst } from '../src/importacion-sst/plantilla-sst-definicion.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const CORREO = (clave: string) => `e2e-isst-${clave.toLowerCase()}@ejemplo.test`;
const PREFIJO = 'E2E-ISST';
const ANIO_DE_LA_CAPACITACION = 2096;
const MENSAJE_DE_ARCHIVO = 'e2e-isst-carga';

type Fila = Record<string, string | number | null>;
type Hojas = Partial<Record<ClaveHojaSst, Fila[]>>;

describe('Carga de SST desde Excel por rol, con los guardas reales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let anioSinParametros: number;
  const tokens: Record<string, string> = {};
  // Los bytes exactos del archivo que se confirmó: volver a armar el libro cambia su marca de tiempo y, con ella, su huella.
  let archivoConfirmado: Buffer;

  const doc = (sufijo: string) => `${PREFIJO}-${sufijo}`;

  async function limpiar() {
    const trabajadores = await prisma.trabajador.findMany({ where: { documento: { startsWith: PREFIJO } }, select: { id: true } });
    const idsTrabajador = trabajadores.map((t) => t.id);
    const ausentismos = await prisma.ausentismo.findMany({ where: { trabajadorId: { in: idsTrabajador } }, select: { id: true } });
    const idsAusentismo = ausentismos.map((a) => a.id);
    const capacitaciones = await prisma.capacitacion.findMany({ where: { tema: { startsWith: PREFIJO } }, select: { id: true } });
    await prisma.$transaction(async (tx) => {
      // Solo para limpiar los datos de esta prueba: estos registros no se pueden borrar de otro modo.
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.importacion.deleteMany({ where: { nombreArchivo: { startsWith: MENSAJE_DE_ARCHIVO } } });
      await tx.recobroAusentismo.deleteMany({ where: { ausentismoId: { in: idsAusentismo } } });
      await tx.ausentismoPeriodo.deleteMany({ where: { ausentismoId: { in: idsAusentismo } } });
      await tx.ausentismo.deleteMany({ where: { id: { in: idsAusentismo } } });
      await tx.entregaEpp.deleteMany({ where: { trabajadorId: { in: idsTrabajador } } });
      await tx.elementoEpp.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
      await tx.asistenciaCapacitacion.deleteMany({ where: { capacitacionId: { in: capacitaciones.map((c) => c.id) } } });
      await tx.capacitacion.deleteMany({ where: { id: { in: capacitaciones.map((c) => c.id) } } });
      await tx.registroAuditoria.deleteMany({ where: { usuarioEmail: { startsWith: 'e2e-isst-' } } });
      await tx.trabajador.deleteMany({ where: { id: { in: idsTrabajador } } });
      await tx.usuario.deleteMany({ where: { email: { startsWith: 'e2e-isst-' } } });
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

    // Un año sin parámetros legales, para probar el error de "no hay parámetros del año".
    for (let anio = 2025; anio >= 2000; anio--) {
      if (!(await prisma.parametroLegal.findUnique({ where: { anio } }))) {
        anioSinParametros = anio;
        break;
      }
    }

    // Lo que la carga NO crea y debe existir antes: un elemento de EPP y una capacitación.
    await como('GERENTE').post('/sst/epp/elementos').send({ nombre: `${PREFIJO} casco`, vidaUtilDias: 365 }).expect(201);
    await como('ADMINISTRADOR')
      .post('/sst/capacitaciones')
      .send({ tema: `${PREFIJO} alturas`, objetivo: 'Prevenir caídas', dirigidoA: 'Todos', modalidad: 'PRESENCIAL', horas: 2, fechaProgramada: `${ANIO_DE_LA_CAPACITACION}-04-10`, responsable: 'Facilitador Inventado', correoResponsable: 'facilitador@ejemplo.test', ejecutor: 'ARL', asistentesProgramados: 10 })
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

  // Arma un libro con los encabezados de la definición y las filas dadas (por clave de columna).
  async function libro(hojas: Hojas): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    for (const definicion of HOJAS_SST) {
      const filas = hojas[definicion.clave];
      if (!filas) continue;
      const hoja = wb.addWorksheet(definicion.nombre);
      hoja.addRow(definicion.columnas.map((c) => c.encabezado));
      for (const fila of filas) hoja.addRow(definicion.columnas.map((c) => fila[c.clave] ?? null));
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const validar = (buffer: Buffer, nombre = `${MENSAJE_DE_ARCHIVO}.xlsx`, rol = 'GERENTE') => como(rol).post('/importacion/sst/validar').attach('archivo', buffer, nombre);
  const confirmar = (buffer: Buffer, huella: string | undefined, nombre = `${MENSAJE_DE_ARCHIVO}.xlsx`, rol = 'GERENTE') => {
    const peticion = como(rol).post('/importacion/sst/confirmar').attach('archivo', buffer, nombre);
    return huella === undefined ? peticion : peticion.field('huella', huella);
  };

  // Lo que quedó en la base de datos de lo que carga esta prueba.
  const trabajadoresCreados = () => prisma.trabajador.count({ where: { documento: { startsWith: PREFIJO } } });
  const ausentismosCreados = () => prisma.ausentismo.count({ where: { trabajador: { documento: { startsWith: PREFIJO } } } });
  const entregasCreadas = () => prisma.entregaEpp.count({ where: { trabajador: { documento: { startsWith: PREFIJO } } } });
  const asistenciasCreadas = () => prisma.asistenciaCapacitacion.count({ where: { trabajador: { documento: { startsWith: PREFIJO } } } });
  const importacionesDeLaPrueba = () => prisma.importacion.count({ where: { nombreArchivo: { startsWith: MENSAJE_DE_ARCHIVO } } });
  const filasAuditadas = (accion: string) => prisma.registroAuditoria.count({ where: { usuarioEmail: CORREO('GERENTE'), accion } });

  // El archivo bueno: dos trabajadores nuevos, un ausentismo (con prórroga), una entrega y una asistencia.
  const TRABAJADOR_A = { documento: doc('A'), nombres: 'Persona', apellidos: 'Inventada Uno', cargo: 'Oficial de obra', salarioBase: 3333333, fechaIngreso: '15/01/2026', tipoContrato: 'Obra o labor' };
  const TRABAJADOR_B = { documento: doc('B'), nombres: 'Persona', apellidos: 'Inventada Dos', cargo: 'Ayudante', salarioBase: '$1.800.000', fechaIngreso: '2026-02-01' };
  const AUSENTISMO_A = { documento: doc('A'), tipo: 'Enfermedad general', fechaInicio: '06/07/2026', fechaFin: '10/07/2026', numeroDocumento: 'INC-ISST-1', cie10: 'M54.5', observaciones: 'Dato de salud inventado' };
  const PRORROGA_A = { documento: doc('A'), tipo: 'Enfermedad general', fechaInicio: '11/07/2026', fechaFin: '15/07/2026', numeroDocumento: 'INC-ISST-2', cie10: 'M54.5', prorroga: 'Sí', diasPrevios: 5 };
  const ENTREGA_A = { documento: doc('A'), elemento: `${PREFIJO} casco`, fecha: '05/03/2026', cantidad: 2, tallaReferencia: 'M', motivo: 'Dotación inicial', firmo: 'Sí' };
  const ASISTENCIA_B = { documento: doc('B'), tema: `${PREFIJO} alturas`, fechaProgramada: `10/04/${ANIO_DE_LA_CAPACITACION}`, firmo: 'Sí', calificacion: '4,5' };
  const BUENO: Hojas = { trabajadores: [TRABAJADOR_A, TRABAJADOR_B], ausentismos: [AUSENTISMO_A, PRORROGA_A], entregasEpp: [ENTREGA_A], asistencias: [ASISTENCIA_B] };

  it('sin sesión no se entra a ninguna ruta', async () => {
    for (const [metodo, ruta] of [['get', '/importacion/sst/plantilla'], ['post', '/importacion/sst/validar'], ['post', '/importacion/sst/confirmar'], ['get', '/importacion/sst']] as const) {
      await request(app.getHttpServer())[metodo](ruta).expect(401);
    }
  });

  it('solo el gerente carga: el administrador, el contratista y Consulta reciben 403 en todo', async () => {
    const buffer = await libro(BUENO);
    for (const rol of ['ADMINISTRADOR', 'CONTRATISTA', 'CONSULTA', 'CONSULTA_LIMITADA']) {
      await como(rol).get('/importacion/sst/plantilla').expect(403);
      await como(rol).get('/importacion/sst').expect(403);
      await validar(buffer, undefined, rol).expect(403);
      await confirmar(buffer, 'a'.repeat(64), undefined, rol).expect(403);
    }
    expect(await trabajadoresCreados()).toBe(0);
  });

  it('el gerente descarga la plantilla: un libro con las hojas de SST', async () => {
    const respuesta = await como('GERENTE')
      .get('/importacion/sst/plantilla')
      .buffer(true)
      .parse((res, devolver) => {
        const partes: Buffer[] = [];
        res.on('data', (parte: Buffer) => partes.push(parte));
        res.on('end', () => devolver(null, Buffer.concat(partes)));
      })
      .expect(200);
    expect(respuesta.headers['content-disposition']).toContain('plantilla-carga-sst.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(respuesta.body as Buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((h) => h.name)).toEqual(['Instrucciones', 'Trabajadores', 'Ausentismos', 'Entregas EPP', 'Asistencias']);
  });

  describe('la prueba previa no guarda nada', () => {
    it('un archivo bueno se valida, dice qué cargaría y NO deja ninguna fila en la base de datos', async () => {
      const buffer = await libro(BUENO);
      const antesAuditoria = await filasAuditadas('TRABAJADOR_CREAR');
      const { body } = await validar(buffer).expect(201);
      expect(body).toMatchObject({ puedeConfirmar: true, yaImportado: null, totalErrores: 0, errores: [] });
      expect(body.huella).toMatch(/^[a-f0-9]{64}$/);
      expect(body.resumen).toMatchObject({
        filas: { trabajadores: 2, ausentismos: 2, entregasEpp: 1, asistencias: 1 },
        trabajadores: { nuevos: 2, existentes: 0 },
        ausentismos: 2,
        entregasEpp: 1,
        asistencias: { registradas: 1, yaRegistradas: 0 },
      });
      // Nada quedó: ni trabajadores, ni ausentismos, ni entregas, ni asistencias, ni auditoría de lo "cargado", ni la importación.
      expect(await trabajadoresCreados()).toBe(0);
      expect(await ausentismosCreados()).toBe(0);
      expect(await entregasCreadas()).toBe(0);
      expect(await asistenciasCreadas()).toBe(0);
      expect(await importacionesDeLaPrueba()).toBe(0);
      expect(await filasAuditadas('TRABAJADOR_CREAR')).toBe(antesAuditoria);
      expect(await filasAuditadas('IMPORTACION_EJECUTAR')).toBe(0);
    });

    it('se puede repetir las veces que haga falta con el mismo resultado (no consume el archivo)', async () => {
      const buffer = await libro(BUENO);
      const primera = (await validar(buffer).expect(201)).body;
      const segunda = (await validar(buffer).expect(201)).body;
      expect(segunda).toMatchObject({ puedeConfirmar: true, huella: primera.huella, resumen: primera.resumen });
    });

    it('un archivo con errores dice cada uno con su hoja, fila y columna, y no deja nada ni de lo que estaba bien', async () => {
      const buffer = await libro({
        trabajadores: [TRABAJADOR_A, { ...TRABAJADOR_B, salarioBase: 'mucho' }],
        ausentismos: [
          AUSENTISMO_A, // bien
          { ...AUSENTISMO_A, fechaInicio: '08/07/2026', fechaFin: '12/07/2026' }, // se traslapa con la fila anterior, que está en la misma carga
          { ...AUSENTISMO_A, documento: doc('NO-EXISTE') },
          { ...AUSENTISMO_A, tipo: 'Vacaciones', fechaInicio: '20/07/2026', fechaFin: '21/07/2026' },
          { ...AUSENTISMO_A, cie10: null, fechaInicio: '22/07/2026', fechaFin: '23/07/2026' }, // una incapacidad sin diagnóstico
          { ...AUSENTISMO_A, cie10: 'Z99.99', fechaInicio: '24/07/2026', fechaFin: '25/07/2026' },
        ],
        entregasEpp: [{ ...ENTREGA_A, elemento: 'Elemento que no existe' }],
        asistencias: [{ ...ASISTENCIA_B, documento: doc('A'), tema: 'Una capacitación que no existe' }],
      });
      const { body } = await validar(buffer).expect(201);
      expect(body.puedeConfirmar).toBe(false);
      const problemas = body.errores as { hoja: string; fila: number | null; columna?: string; mensaje: string }[];
      const de = (hoja: string, fila: number) => problemas.filter((p) => p.hoja === hoja && p.fila === fila);
      expect(de('Trabajadores', 3)).toEqual([expect.objectContaining({ columna: 'Salario base' })]);
      expect(de('Ausentismos', 2)).toEqual([]);
      expect(de('Ausentismos', 3)[0].mensaje).toMatch(/ya tiene un ausentismo en esas fechas: del 2026-07-06 al 2026-07-10/);
      expect(de('Ausentismos', 4)[0].mensaje).toMatch(/No existe un trabajador con el documento E2E-ISST-NO-EXISTE/);
      expect(de('Ausentismos', 5)[0].mensaje).toMatch(/No existe el tipo de ausentismo "Vacaciones"/);
      expect(de('Ausentismos', 6)[0].mensaje).toMatch(/exige el diagnóstico CIE-10/);
      expect(de('Ausentismos', 7)[0]).toMatchObject({ columna: 'Código CIE-10', mensaje: expect.stringMatching(/Z99\.99/) });
      expect(de('Entregas EPP', 2)[0].mensaje).toMatch(/No existe el elemento "Elemento que no existe"/);
      expect(de('Asistencias', 2)[0].mensaje).toMatch(/No existe una capacitación "Una capacitación que no existe"/);
      expect(body.totalErrores).toBe(problemas.length);
      // Ni siquiera lo que estaba bien quedó guardado.
      expect(await trabajadoresCreados()).toBe(0);
      expect(await ausentismosCreados()).toBe(0);
    });

    it('un ausentismo de un año sin parámetros legales dice dónde crearlos', async () => {
      expect(anioSinParametros).toBeGreaterThanOrEqual(2000);
      const buffer = await libro({
        trabajadores: [{ ...TRABAJADOR_A, fechaIngreso: '01/01/1999' }],
        ausentismos: [{ ...AUSENTISMO_A, fechaInicio: `06/07/${anioSinParametros}`, fechaFin: `10/07/${anioSinParametros}` }],
      });
      const { body } = await validar(buffer).expect(201);
      expect(body.errores).toEqual([expect.objectContaining({ hoja: 'Ausentismos', fila: 2, mensaje: expect.stringMatching(new RegExp(`No hay parámetros legales del año ${anioSinParametros}.*Seguridad social`)) })]);
    });

    it('un ausentismo anterior al ingreso del trabajador se rechaza con la regla de siempre', async () => {
      const buffer = await libro({ trabajadores: [TRABAJADOR_A], ausentismos: [{ ...AUSENTISMO_A, fechaInicio: '01/01/2026', fechaFin: '03/01/2026' }] });
      const { body } = await validar(buffer).expect(201);
      expect(body.errores).toEqual([expect.objectContaining({ hoja: 'Ausentismos', mensaje: expect.stringMatching(/antes de la fecha de ingreso/) })]);
    });

    it('un documento repetido en la hoja de trabajadores es un error', async () => {
      const buffer = await libro({ trabajadores: [TRABAJADOR_A, TRABAJADOR_A] });
      const { body } = await validar(buffer).expect(201);
      expect(body.errores).toEqual([expect.objectContaining({ hoja: 'Trabajadores', fila: 3, mensaje: expect.stringMatching(/ya aparece en la fila 2/) })]);
    });

    it('lo que no es un libro de Excel, o no trae ninguna hoja de la plantilla, se rechaza', async () => {
      await validar(Buffer.from('esto no es un libro de Excel')).expect(400);
      const otro = new ExcelJS.Workbook();
      otro.addWorksheet('Otra hoja').addRow(['a']);
      await validar(Buffer.from(await otro.xlsx.writeBuffer())).expect(400);
      await como('GERENTE').post('/importacion/sst/validar').expect(400);
    });

    it('un libro vacío (solo encabezados) se rechaza, no se carga en vacío', async () => {
      const { body } = await validar(await libro({ trabajadores: [] })).expect(201);
      expect(body.puedeConfirmar).toBe(false);
      expect(body.errores).toEqual([expect.objectContaining({ hoja: 'Archivo', mensaje: expect.stringMatching(/no tiene filas/) })]);
    });
  });

  describe('la confirmación es todo o nada', () => {
    it('exige la huella del archivo que se validó', async () => {
      const buffer = await libro(BUENO);
      await confirmar(buffer, undefined).expect(400);
      await confirmar(buffer, 'a'.repeat(64)).expect(400);
      await confirmar(buffer, 'no-es-una-huella').expect(400);
      expect(await trabajadoresCreados()).toBe(0);
    });

    it('un archivo con UN error no guarda nada, aunque el resto esté bien', async () => {
      const buffer = await libro({ ...BUENO, entregasEpp: [{ ...ENTREGA_A, elemento: 'Elemento que no existe' }] });
      const { huella } = (await validar(buffer).expect(201)).body;
      const respuesta = await confirmar(buffer, huella).expect(400);
      expect(respuesta.body).toMatchObject({ codigo: 'IMPORTACION_CON_ERRORES', totalErrores: 1, errores: [expect.objectContaining({ hoja: 'Entregas EPP', fila: 2 })] });
      expect(await trabajadoresCreados()).toBe(0);
      expect(await ausentismosCreados()).toBe(0);
      expect(await asistenciasCreadas()).toBe(0);
      expect(await importacionesDeLaPrueba()).toBe(0);
    });

    it('un archivo bueno se carga completo, con las reglas de siempre aplicadas a cada fila', async () => {
      const buffer = await libro(BUENO);
      archivoConfirmado = buffer;
      const { huella } = (await validar(buffer).expect(201)).body;
      const { body } = await confirmar(buffer, huella).expect(201);
      expect(body).toMatchObject({ nombreArchivo: `${MENSAJE_DE_ARCHIVO}.xlsx`, resumen: { trabajadores: { nuevos: 2, existentes: 0 }, ausentismos: 2, entregasEpp: 1, asistencias: { registradas: 1, yaRegistradas: 0 } } });

      expect(await trabajadoresCreados()).toBe(2);
      const trabajadorA = await prisma.trabajador.findUniqueOrThrow({ where: { documento: doc('A') } });
      expect(trabajadorA).toMatchObject({ nombre: 'Persona Inventada Uno', cargo: 'Oficial de obra', tipoContrato: 'OBRA_LABOR', estado: 'ACTIVO' });
      expect(trabajadorA.salarioBase.toString()).toBe('3333333');
      const trabajadorB = await prisma.trabajador.findUniqueOrThrow({ where: { documento: doc('B') } });
      expect(trabajadorB.salarioBase.toString()).toBe('1800000'); // "$1.800.000" se leyó como pesos enteros

      // El ausentismo se liquidó como si se hubiera digitado: foto del salario, períodos, recobro a la EPS y la prórroga encadenada por días.
      const ausentismos = await prisma.ausentismo.findMany({ where: { trabajadorId: trabajadorA.id }, orderBy: { fechaInicio: 'asc' }, include: { periodos: true, recobros: true, diagnostico: true } });
      expect(ausentismos).toHaveLength(2);
      expect(ausentismos[0]).toMatchObject({ dias: 5, numeroDocumento: 'INC-ISST-1', esProrroga: false, observaciones: 'Dato de salud inventado' });
      expect(ausentismos[0].diagnostico?.codigo).toBe('M54.5');
      expect(ausentismos[0].salarioFoto.toString()).toBe('3333333');
      expect(ausentismos[0].periodos).toHaveLength(1);
      expect(ausentismos[0].recobros.map((r) => r.entidad)).toContain('EPS');
      expect(ausentismos[1]).toMatchObject({ esProrroga: true, diasPrevios: 5, dias: 5 });

      const entrega = await prisma.entregaEpp.findFirstOrThrow({ where: { trabajadorId: trabajadorA.id } });
      expect(entrega).toMatchObject({ cantidad: 2, tallaReferencia: 'M', motivo: 'DOTACION_INICIAL', firmoRecibido: true, vidaUtilDias: 365 });
      expect(entrega.proximaReposicion.getFullYear()).toBe(2027);
      const asistencia = await prisma.asistenciaCapacitacion.findFirstOrThrow({ where: { trabajadorId: trabajadorB.id } });
      expect(asistencia).toMatchObject({ firmo: true });
      expect(asistencia.calificacion?.toString()).toBe('4.5');
    });

    it('cada fila quedó en la auditoría como siempre, la carga tiene su registro, y el diagnóstico no está en ninguno', async () => {
      expect(await filasAuditadas('IMPORTACION_EJECUTAR')).toBe(1);
      expect(await filasAuditadas('TRABAJADOR_CREAR')).toBeGreaterThanOrEqual(2);
      expect(await filasAuditadas('AUSENTISMO_REGISTRAR')).toBe(2);
      expect(await filasAuditadas('ENTREGA_EPP_REGISTRAR')).toBe(1);
      expect(await filasAuditadas('CAPACITACION_ASISTENCIA_REGISTRAR')).toBe(1);
      const registros = await prisma.registroAuditoria.findMany({ where: { usuarioEmail: CORREO('GERENTE') } });
      expect(JSON.stringify(registros)).not.toMatch(/M54|Lumbago|Dato de salud inventado/);
      const carga = registros.find((r) => r.accion === 'IMPORTACION_EJECUTAR');
      expect(carga?.resumen).toMatch(/2 trabajador\(es\) nuevo\(s\), 2 ausentismo\(s\), 1 entrega\(s\) de EPP y 1 asistencia\(s\)/);
    });

    it('la carga aparece en la lista de cargas de SST y NO en la de ventas', async () => {
      const sst = (await como('GERENTE').get('/importacion/sst').expect(200)).body as { nombreArchivo: string; resumen: { ausentismos: number } }[];
      expect(sst.map((i) => i.nombreArchivo)).toContain(`${MENSAJE_DE_ARCHIVO}.xlsx`);
      expect(sst.find((i) => i.nombreArchivo === `${MENSAJE_DE_ARCHIVO}.xlsx`)?.resumen.ausentismos).toBe(2);
      const ventas = (await como('GERENTE').get('/importacion').expect(200)).body as { nombreArchivo: string }[];
      expect(ventas.map((i) => i.nombreArchivo)).not.toContain(`${MENSAJE_DE_ARCHIVO}.xlsx`);
    });

    it('el mismo archivo no se carga dos veces: la prueba previa lo dice y la confirmación responde 409', async () => {
      const buffer = archivoConfirmado;
      const { body } = await validar(buffer).expect(201);
      expect(body.yaImportado).toMatchObject({ por: 'Prueba GERENTE' });
      expect(body.puedeConfirmar).toBe(false);
      await confirmar(buffer, body.huella).expect(409);
      expect(await trabajadoresCreados()).toBe(2);
      expect(await ausentismosCreados()).toBe(2);
    });
  });

  describe('una segunda carga con datos que ya existen', () => {
    it('reutiliza a los trabajadores que ya están, sin modificarlos, y avisa', async () => {
      const buffer = await libro({
        trabajadores: [{ ...TRABAJADOR_A, cargo: 'Un cargo distinto', salarioBase: 9999999 }],
        ausentismos: [{ ...AUSENTISMO_A, fechaInicio: '20/07/2026', fechaFin: '22/07/2026', numeroDocumento: 'INC-ISST-3', cie10: 'M54.5' }],
        asistencias: [ASISTENCIA_B], // ya registrada en la carga anterior
      });
      const { body } = await validar(buffer, `${MENSAJE_DE_ARCHIVO}-2.xlsx`).expect(201);
      expect(body.errores).toEqual([]);
      expect(body.resumen).toMatchObject({ trabajadores: { nuevos: 0, existentes: 1 }, ausentismos: 1, asistencias: { registradas: 0, yaRegistradas: 1 } });
      const avisos = (body.avisos as { hoja: string; mensaje: string }[]).map((a) => `${a.hoja}: ${a.mensaje}`);
      expect(avisos).toEqual([expect.stringMatching(/^Trabajadores: Ya existe un trabajador con el documento/), expect.stringMatching(/^Asistencias: Este trabajador ya estaba registrado/)]);

      await confirmar(buffer, body.huella, `${MENSAJE_DE_ARCHIVO}-2.xlsx`).expect(201);
      const trabajadorA = await prisma.trabajador.findUniqueOrThrow({ where: { documento: doc('A') } });
      expect(trabajadorA).toMatchObject({ cargo: 'Oficial de obra' }); // no se modificó
      expect(trabajadorA.salarioBase.toString()).toBe('3333333');
      expect(await ausentismosCreados()).toBe(3);
      expect(await asistenciasCreadas()).toBe(1); // no se duplicó
    });

    it('un ausentismo que se traslapa con uno que YA está en el sistema se rechaza', async () => {
      const buffer = await libro({ ausentismos: [{ ...AUSENTISMO_A, fechaInicio: '08/07/2026', fechaFin: '09/07/2026' }] });
      const { body } = await validar(buffer, `${MENSAJE_DE_ARCHIVO}-3.xlsx`).expect(201);
      expect(body.puedeConfirmar).toBe(false);
      expect(body.errores[0].mensaje).toMatch(/ya tiene un ausentismo en esas fechas/);
    });
  });
});
