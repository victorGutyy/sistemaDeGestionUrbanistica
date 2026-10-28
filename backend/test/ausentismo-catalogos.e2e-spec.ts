// Prueba de permisos de punta a punta de los catálogos del ausentismo (RF-CFG-14, RF-USR-10): arranca la app completa con
// los guardas reales y entra con un token de cada rol. Requiere Postgres arriba y backend/.env.
//
// Crea usuarios de prueba y los borra al terminar. Los catálogos no se pueden borrar (la base lo impide), así que las
// escrituras que se prueban llevan un cuerpo inválido: pasan el guarda de permisos (400) o no lo pasan (403), y no dejan datos.
import 'dotenv/config';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const ID_AJENO = '00000000-0000-4000-8000-000000000000';
const CORREO = (clave: string) => `e2e-aus-${clave.toLowerCase()}@ejemplo.test`;

describe('Catálogos del ausentismo por rol, con los guardas reales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};

  async function limpiar() {
    await prisma.usuario.deleteMany({ where: { email: { startsWith: 'e2e-aus-' } } });
  }

  beforeAll(async () => {
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

  it('sin sesión no se entra a los catálogos', async () => {
    await request(app.getHttpServer()).get('/sst/ausentismo/tipos').expect(401);
    await request(app.getHttpServer()).get('/sst/ausentismo/diagnosticos').expect(401);
  });

  describe.each(['GERENTE', 'ADMINISTRADOR', 'CONTRATISTA'])('%s lee los catálogos', (clave) => {
    it('lista los tipos de ausentismo con su regla', async () => {
      const { body } = await como(clave).get('/sst/ausentismo/tipos').expect(200);
      expect(body).toHaveLength(9);
      expect(body[0]).toMatchObject({ codigo: 'ENFERMEDAD_GENERAL', regla: 'INCAPACIDAD_GENERAL' });
    });

    it('busca diagnósticos por código o por descripción', async () => {
      const porCodigo = (await como(clave).get('/sst/ausentismo/diagnosticos?q=j06').expect(200)).body as { codigo: string }[];
      expect(porCodigo.map((d) => d.codigo)).toContain('J06.9');
      const porTexto = (await como(clave).get('/sst/ausentismo/diagnosticos?q=lumbago&limite=5').expect(200)).body as { codigo: string }[];
      expect(porTexto.length).toBeGreaterThan(0);
      expect(porTexto.length).toBeLessThanOrEqual(5);
      expect(porTexto.every((d) => d.codigo.startsWith('M54'))).toBe(true);
    });

    it('rechaza un límite fuera de rango', async () => {
      await como(clave).get('/sst/ausentismo/diagnosticos?limite=5000').expect(400);
    });
  });

  describe.each(['CONSULTA', 'CONSULTA_LIMITADA'])('%s no recibe nada del ausentismo', (clave) => {
    it('no lee los catálogos ni los escribe', async () => {
      await como(clave).get('/sst/ausentismo/tipos').expect(403);
      await como(clave).get('/sst/ausentismo/diagnosticos').expect(403);
      await como(clave).post('/sst/ausentismo/tipos').send({}).expect(403);
      await como(clave).post('/sst/ausentismo/diagnosticos').send({}).expect(403);
      await como(clave).patch(`/sst/ausentismo/tipos/${ID_AJENO}`).send({}).expect(403);
      await como(clave).patch(`/sst/ausentismo/diagnosticos/${ID_AJENO}`).send({}).expect(403);
    });
  });

  describe('los tipos con su regla los administra solo el gerente', () => {
    it('el gerente pasa el guarda de permisos (el cuerpo inválido da 400)', async () => {
      await como('GERENTE').post('/sst/ausentismo/tipos').send({ codigo: 'en minúscula', nombre: 'x', regla: 'INVENTADA' }).expect(400);
      await como('GERENTE').patch(`/sst/ausentismo/tipos/${ID_AJENO}`).send({ porcentaje: 500 }).expect(400);
    });

    it.each(['ADMINISTRADOR', 'CONTRATISTA'])('%s no crea ni cambia tipos', async (clave) => {
      await como(clave).post('/sst/ausentismo/tipos').send({ codigo: 'OTRO_TIPO', nombre: 'Otro tipo', regla: 'DESCUENTO', porcentaje: 100 }).expect(403);
      await como(clave).patch(`/sst/ausentismo/tipos/${ID_AJENO}`).send({ porcentaje: 50 }).expect(403);
    });

    it('un tipo que no existe da 404 al gerente', async () => {
      await como('GERENTE').patch(`/sst/ausentismo/tipos/${ID_AJENO}`).send({ activo: false }).expect(404);
    });
  });

  describe('los diagnósticos los agrega quien gestiona el módulo SST', () => {
    it.each(['GERENTE', 'ADMINISTRADOR', 'CONTRATISTA'])('%s pasa el guarda de permisos (el cuerpo inválido da 400)', async (clave) => {
      await como(clave).post('/sst/ausentismo/diagnosticos').send({ codigo: 'mal', descripcion: 'x' }).expect(400);
      await como(clave).patch(`/sst/ausentismo/diagnosticos/${ID_AJENO}`).send({ descripcion: 'x' }).expect(400);
    });

    it('un diagnóstico que no existe da 404', async () => {
      await como('CONTRATISTA').patch(`/sst/ausentismo/diagnosticos/${ID_AJENO}`).send({ activo: false }).expect(404);
    });
  });
});
