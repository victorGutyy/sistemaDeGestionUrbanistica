// Prueba de humo de seguridad: arranca la app completa (con la base de datos
// de desarrollo, solo lectura) y confirma que ninguna ruta responde sin
// sesión. Requiere Postgres arriba y backend/.env con JWT_SECRET.
import 'dotenv/config';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

const ID = '00000000-0000-0000-0000-000000000000';

const RUTAS_PROTEGIDAS: [metodo: 'get' | 'post' | 'put' | 'patch', ruta: string][] = [
  ['get', '/'],
  ['get', '/auth/me'],
  ['get', '/usuarios'],
  ['get', '/roles'],
  ['patch', `/usuarios/${ID}`],
  ['post', `/usuarios/${ID}/password`],
  ['post', `/usuarios/${ID}/desbloquear`],
  ['post', '/usuarios'],
  ['patch', `/usuarios/${ID}/estado`],
  ['get', '/proyectos'],
  ['post', '/proyectos'],
  ['get', `/proyectos/${ID}`],
  ['patch', `/proyectos/${ID}/estado`],
  ['get', '/lotes'],
  ['post', '/lotes'],
  ['get', `/lotes/${ID}`],
  ['patch', `/lotes/${ID}`],
  ['post', `/lotes/${ID}/separar`],
  ['post', `/lotes/${ID}/liberar`],
  ['post', `/lotes/${ID}/escriturar`],
  ['post', `/lotes/${ID}/reponer`],
  ['post', `/proyectos/${ID}/manzanas`],
  ['get', '/clientes'],
  ['post', '/clientes'],
  ['get', `/clientes/${ID}`],
  ['get', '/ventas'],
  ['post', '/ventas'],
  ['get', `/ventas/${ID}`],
  ['get', '/ventas/parametros'],
  ['get', '/ventas/vendedores'],
  ['post', `/ventas/${ID}/aprobar`],
  ['post', `/ventas/${ID}/rechazar`],
  ['get', '/abonos'],
  ['post', '/abonos'],
  ['get', `/abonos/${ID}/comprobante`],
  ['get', '/cartera'],
  ['get', '/cartera/reporte'],
  ['get', '/finanzas/movimientos'],
  ['post', '/finanzas/movimientos'],
  ['get', '/finanzas/consolidado'],
  ['get', '/trabajadores'],
  ['post', '/trabajadores'],
  ['get', `/trabajadores/${ID}`],
  ['get', '/nomina/pagos'],
  ['post', '/nomina/pagos'],
  ['get', '/dashboard'],
  ['get', '/dashboard/exportar?formato=pdf'],
  ['post', '/recordatorios/ejecutar'],
  ['get', '/configuracion'],
  ['put', '/configuracion/empresa'],
  ['put', '/configuracion/parametros'],
  ['post', '/configuracion/logo'],
  ['post', '/configuracion/cuentas'],
  ['patch', `/configuracion/cuentas/${ID}`],
  ['get', '/configuracion/medios-pago'],
  ['patch', '/configuracion/medios-pago/EFECTIVO'],
  ['post', '/configuracion/categorias-gasto'],
  ['put', '/configuracion/comisiones/REFERIDO'],
];

describe('Seguridad básica (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(RUTAS_PROTEGIDAS)('%s %s rechaza una petición sin sesión con 401', async (metodo, ruta) => {
    await request(app.getHttpServer())[metodo](ruta).expect(401);
  });

  it('la marca pública (nombre, color) es accesible sin sesión y no expone datos sensibles', async () => {
    const respuesta = await request(app.getHttpServer()).get('/configuracion/publica').expect(200);
    expect(respuesta.body).toHaveProperty('nombreComercial');
    expect(respuesta.body).toHaveProperty('colorPrimario');
    expect(respuesta.body).not.toHaveProperty('nit');
  });

  it('rechaza un token inventado con 401', async () => {
    await request(app.getHttpServer()).get('/proyectos').set('Authorization', 'Bearer token.inventado.falso').expect(401);
  });

  it('el login con credenciales que no existen responde 401 y no revela si el correo existe', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'no-existe@ejemplo.test', password: 'clave-incorrecta' })
      .expect(401);
    expect(respuesta.body.message).toBe('Credenciales inválidas');
  });

  it('el login con un cuerpo inválido responde 400', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({ email: 'no-es-correo' }).expect(400);
  });
});
