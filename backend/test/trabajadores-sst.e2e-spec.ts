// Prueba de permisos de punta a punta (RF-USR-10, RF-USR-11, RNF-SEG-08): arranca la app completa con los guardas
// reales y entra con un token de cada rol. Requiere Postgres arriba y backend/.env.
//
// Crea usuarios y un trabajador de prueba (con datos inventados) y los borra al terminar. Solo hace lecturas y
// escrituras que el servidor rechaza, así que no deja afiliaciones, documentos ni auditoría (que no se pueden borrar).
import 'dotenv/config';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const ID_AJENO = '00000000-0000-4000-8000-000000000000';
const CORREO = (clave: string) => `e2e-sst-${clave.toLowerCase()}@ejemplo.test`;
const SALARIO_DE_PRUEBA = '1234567';

describe('Trabajadores y SST por rol, con los guardas reales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let trabajadorId: string;
  const tokens: Record<string, string> = {};
  const usuariosCreados: string[] = [];

  async function limpiar() {
    await prisma.usuario.deleteMany({ where: { email: { startsWith: 'e2e-sst-' } } });
    await prisma.trabajador.deleteMany({ where: { documento: { startsWith: 'E2E-SST-' } } });
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    await limpiar();

    const trabajador = await prisma.trabajador.create({
      data: { nombre: 'Persona Inventada', documento: `E2E-SST-${Date.now()}`, cargo: 'Oficial', salarioBase: SALARIO_DE_PRUEBA, fechaIngreso: new Date(2026, 0, 1) },
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
      usuariosCreados.push(usuario.id);
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
    put: (ruta: string) => request(app.getHttpServer()).put(ruta).set('Authorization', `Bearer ${tokens[clave]}`),
  });

  describe('contratista SST', () => {
    it('entra al módulo SST: lista, alertas, catálogos y ficha del trabajador', async () => {
      await como('CONTRATISTA').get('/trabajadores/sst').expect(200);
      await como('CONTRATISTA').get('/trabajadores/alertas-sst').expect(200);
      await como('CONTRATISTA').get('/seguridad-social/catalogos').expect(200);
      await como('CONTRATISTA').get(`/trabajadores/${trabajadorId}/ficha-sst`).expect(200);
      await como('CONTRATISTA').get(`/trabajadores/${trabajadorId}/afiliaciones`).expect(200);
      await como('CONTRATISTA').get(`/trabajadores/${trabajadorId}/documentos`).expect(200);
    });

    it('en ninguna respuesta del módulo SST aparece el salario ni los pagos', async () => {
      for (const ruta of ['/trabajadores/sst', `/trabajadores/${trabajadorId}/ficha-sst`]) {
        const { body, text } = await como('CONTRATISTA').get(ruta).expect(200);
        expect(text, ruta).not.toContain(SALARIO_DE_PRUEBA);
        expect(text, ruta).not.toMatch(/salarioBase|"pagos"/);
        expect(body).toBeDefined();
      }
      const ficha = (await como('CONTRATISTA').get(`/trabajadores/${trabajadorId}/ficha-sst`).expect(200)).body;
      expect(ficha).toMatchObject({ id: trabajadorId, cargo: 'Oficial', tipoDocumento: 'CC' });
    });

    it('no llega al detalle con salario, a la lista de nómina, a pagos ni a finanzas', async () => {
      await como('CONTRATISTA').get('/trabajadores').expect(403);
      await como('CONTRATISTA').get(`/trabajadores/${trabajadorId}`).expect(403);
      await como('CONTRATISTA').get('/nomina/pagos').expect(403);
      await como('CONTRATISTA').get('/finanzas/movimientos').expect(403);
      await como('CONTRATISTA').get('/cartera').expect(403);
      await como('CONTRATISTA').get('/configuracion').expect(403);
    });

    it('no edita trabajadores, no afilia, no cambia la configuración ni adjunta contratos', async () => {
      await como('CONTRATISTA').patch(`/trabajadores/${trabajadorId}`).send({ cargo: 'Gerente' }).expect(403);
      await como('CONTRATISTA').post(`/trabajadores/${trabajadorId}/retiro`).send({ fechaRetiro: '2026-06-30', motivo: 'Prueba de permisos' }).expect(403);
      await como('CONTRATISTA').post(`/trabajadores/${trabajadorId}/afiliaciones`).send({ tipo: 'EPS', entidadId: ID_AJENO, fechaInicio: '2026-02-01' }).expect(403);
      await como('CONTRATISTA').post('/seguridad-social/entidades').send({ tipo: 'EPS', nombre: 'No debería crearse' }).expect(403);
      const pdf = Buffer.from('%PDF-1.4\nprueba');
      await como('CONTRATISTA').post(`/trabajadores/${trabajadorId}/documentos`).field('tipo', 'CONTRATO').attach('documento', pdf, 'contrato.pdf').expect(403);
    });
  });

  describe('administrador', () => {
    it('ve el detalle con salario y también entra al módulo SST', async () => {
      const detalle = await como('ADMINISTRADOR').get(`/trabajadores/${trabajadorId}`).expect(200);
      expect(detalle.body.salarioBase).toBe(SALARIO_DE_PRUEBA);
      expect(detalle.body.legales).toBeDefined();
      await como('ADMINISTRADOR').get('/trabajadores/sst').expect(200);
    });

    it('lee los catálogos de seguridad social pero no los modifica (eso es del gerente)', async () => {
      await como('ADMINISTRADOR').get('/seguridad-social/catalogos').expect(200);
      await como('ADMINISTRADOR').post('/seguridad-social/entidades').send({ tipo: 'EPS', nombre: 'No debería crearse' }).expect(403);
    });
  });

  describe('gerente', () => {
    it('ve el detalle completo y los catálogos', async () => {
      await como('GERENTE').get(`/trabajadores/${trabajadorId}`).expect(200);
      await como('GERENTE').get('/seguridad-social/catalogos').expect(200);
    });
  });

  describe('consulta', () => {
    it('no ve nada del personal ni del módulo SST', async () => {
      for (const ruta of ['/trabajadores', '/trabajadores/sst', '/trabajadores/alertas-sst', `/trabajadores/${trabajadorId}`, `/trabajadores/${trabajadorId}/ficha-sst`, '/seguridad-social/catalogos']) {
        await como('CONSULTA').get(ruta).expect(403);
      }
    });

    it('limitada a ciertos proyectos tampoco', async () => {
      await como('CONSULTA_LIMITADA').get('/trabajadores/sst').expect(403);
      await como('CONSULTA_LIMITADA').get(`/trabajadores/${trabajadorId}/ficha-sst`).expect(403);
    });
  });

  // Solo lecturas y escrituras que el servidor rechaza: una entrega aceptada no se podría borrar de la base.
  describe('elementos de protección personal por rol', () => {
    const LECTURAS = ['/sst/epp/elementos', '/sst/epp/reposiciones', '/sst/epp/entregas'];

    it('el contratista SST y el administrador consultan el catálogo, las reposiciones y las entregas', async () => {
      for (const rol of ['CONTRATISTA', 'ADMINISTRADOR', 'GERENTE']) {
        for (const ruta of LECTURAS) {
          await como(rol).get(ruta).expect(200);
        }
      }
    });

    it('el catálogo y las reposiciones traen la estructura esperada', async () => {
      const elementos = (await como('CONTRATISTA').get('/sst/epp/elementos').expect(200)).body as { nombre: string; vidaUtilDias: number }[];
      expect(elementos.length).toBeGreaterThanOrEqual(18);
      expect(elementos[0]).toHaveProperty('vidaUtilDias');
      const reposiciones = (await como('CONTRATISTA').get('/sst/epp/reposiciones').expect(200)).body;
      expect(reposiciones).toMatchObject({ diasAlerta: 15, resumen: { vencidos: expect.any(Number), porReponer: expect.any(Number), vigentes: expect.any(Number) } });
    });

    it('consulta, con o sin límite de proyecto, no ve ni escribe nada de EPP', async () => {
      for (const rol of ['CONSULTA', 'CONSULTA_LIMITADA']) {
        for (const ruta of LECTURAS) {
          await como(rol).get(ruta).expect(403);
        }
        await como(rol).post('/sst/epp/entregas').send({}).expect(403);
        await como(rol).post('/sst/epp/elementos').send({ nombre: 'No debería crearse', vidaUtilDias: 30 }).expect(403);
      }
    });

    it('los datos de entrada inválidos se rechazan con 400 antes de llegar a la base', async () => {
      await como('CONTRATISTA').post('/sst/epp/entregas').send({}).expect(400);
      await como('CONTRATISTA').post('/sst/epp/entregas').send({ trabajadorId: 'no-es-uuid', elementoId: ID_AJENO, fecha: '2026-01-01', cantidad: 1, motivo: 'DOTACION_INICIAL' }).expect(400);
      await como('CONTRATISTA').post('/sst/epp/entregas').send({ trabajadorId: ID_AJENO, elementoId: ID_AJENO, fecha: '2026-01-01', cantidad: 0, motivo: 'DOTACION_INICIAL' }).expect(400);
      await como('CONTRATISTA').post('/sst/epp/entregas').send({ trabajadorId: ID_AJENO, elementoId: ID_AJENO, fecha: '2026-01-01', cantidad: 1, motivo: 'INVENTADO' }).expect(400);
      await como('CONTRATISTA').post('/sst/epp/elementos').send({ nombre: 'Casco', vidaUtilDias: 0 }).expect(400);
      await como('CONTRATISTA').get('/sst/epp/reposiciones?estado=INVENTADO').expect(400);
      await como('CONTRATISTA').get('/sst/epp/entregas/no-es-uuid').expect(400);
    });

    it('un trabajador, un elemento o una entrega que no existen responden 404 y no se escribe nada', async () => {
      await como('CONTRATISTA').post('/sst/epp/entregas').send({ trabajadorId: ID_AJENO, elementoId: ID_AJENO, fecha: '2026-01-01', cantidad: 1, motivo: 'DOTACION_INICIAL' }).expect(404);
      await como('CONTRATISTA').get(`/sst/epp/entregas/${ID_AJENO}`).expect(404);
      await como('CONTRATISTA').post(`/sst/epp/entregas/${ID_AJENO}/anular`).send({ motivo: 'Prueba de permisos' }).expect(404);
      await como('CONTRATISTA').get(`/sst/epp/entregas/${ID_AJENO}/documentos`).expect(404);
    });
  });

  describe('validación de los datos de entrada', () => {
    it('un identificador que no es UUID se rechaza con 400 antes de llegar a la base', async () => {
      await como('GERENTE').get('/trabajadores/no-es-un-uuid').expect(400);
      await como('CONTRATISTA').get('/trabajadores/no-es-un-uuid/ficha-sst').expect(400);
    });

    it('un trabajador que no existe responde 404', async () => {
      await como('CONTRATISTA').get(`/trabajadores/${ID_AJENO}/ficha-sst`).expect(404);
      await como('CONTRATISTA').get(`/trabajadores/${ID_AJENO}/afiliaciones`).expect(404);
    });

    it('un tipo de documento inventado o campos de más se rechazan', async () => {
      const pdf = Buffer.from('%PDF-1.4\nprueba');
      await como('GERENTE').post(`/trabajadores/${trabajadorId}/documentos`).field('tipo', 'INVENTADO').attach('documento', pdf, 'x.pdf').expect(400);
      await como('GERENTE').patch(`/trabajadores/${trabajadorId}`).send({ documento: 'cambiar-la-identidad' }).expect(400);
    });
  });
});
