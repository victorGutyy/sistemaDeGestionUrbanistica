import { Controller, Get, HttpCode, Post, UseGuards, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITES_DE_RESERVA, leerLimite, limitarPorIp, LimitePorIpGuard } from './limite-por-ip.js';

const VARIABLES = [
  'LIMITE_POR_IP',
  'LIMITE_LOGIN_PETICIONES',
  'LIMITE_LOGIN_SEGUNDOS',
  'LIMITE_RECUPERAR_PETICIONES',
  'LIMITE_RECUPERAR_SEGUNDOS',
];

function limpiarEntorno() {
  for (const variable of VARIABLES) delete process.env[variable];
}

describe('leerLimite: valores del entorno con reserva', () => {
  beforeEach(limpiarEntorno);
  afterEach(limpiarEntorno);

  it('usa los valores de reserva cuando el entorno no dice nada', () => {
    expect(leerLimite('LOGIN')).toEqual(LIMITES_DE_RESERVA.LOGIN);
    expect(leerLimite('RECUPERAR')).toEqual(LIMITES_DE_RESERVA.RECUPERAR);
  });

  it('toma los valores del entorno cuando son enteros positivos', () => {
    process.env.LIMITE_LOGIN_PETICIONES = '3';
    process.env.LIMITE_LOGIN_SEGUNDOS = '120';

    expect(leerLimite('LOGIN')).toEqual({ peticiones: 3, segundos: 120 });
  });

  it.each(['', '  ', 'abc', '0', '-5', '2.5', 'NaN'])('ignora el valor inválido %j y usa el de reserva', (valor) => {
    process.env.LIMITE_LOGIN_PETICIONES = valor;
    process.env.LIMITE_LOGIN_SEGUNDOS = valor;

    expect(leerLimite('LOGIN')).toEqual(LIMITES_DE_RESERVA.LOGIN);
  });
});

// Rutas de prueba con los mismos decoradores que las de auth.controller.ts.
@Controller('prueba')
class ControladorDePrueba {
  @UseGuards(LimitePorIpGuard)
  @limitarPorIp('LOGIN')
  @HttpCode(200)
  @Post('entrar')
  entrar() {
    return { ok: true };
  }

  @UseGuards(LimitePorIpGuard)
  @limitarPorIp('RECUPERAR')
  @HttpCode(200)
  @Post('recuperar')
  recuperar() {
    return { ok: true };
  }

  // Sin límite: representa las rutas que exigen sesión.
  @Get('libre')
  libre() {
    return { ok: true };
  }
}

describe('LimitePorIpGuard: límite por IP en las rutas públicas', () => {
  let app: INestApplication;

  beforeEach(async () => {
    limpiarEntorno();
    process.env.LIMITE_LOGIN_PETICIONES = '3';
    process.env.LIMITE_LOGIN_SEGUNDOS = '60';
    process.env.LIMITE_RECUPERAR_PETICIONES = '2';
    process.env.LIMITE_RECUPERAR_SEGUNDOS = '60';
    const modulo = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 10 }] })],
      controllers: [ControladorDePrueba],
    }).compile();
    app = modulo.createNestApplication();
    // Igual que main.ts: detrás de Caddy hay un solo intermediario y la IP real viene en X-Forwarded-For.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    limpiarEntorno();
  });

  const desde = (ip: string, ruta: string) => request(app.getHttpServer()).post(ruta).set('X-Forwarded-For', ip);

  it('deja pasar hasta el límite y responde 429 en español con Retry-After al pasarse', async () => {
    for (let i = 0; i < 3; i++) await desde('203.0.113.10', '/prueba/entrar').expect(200);

    const respuesta = await desde('203.0.113.10', '/prueba/entrar').expect(429);

    expect(respuesta.body.message).toContain('Demasiados intentos');
    expect(Number(respuesta.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('cuenta por separado a cada dirección IP', async () => {
    for (let i = 0; i < 3; i++) await desde('203.0.113.10', '/prueba/entrar').expect(200);
    await desde('203.0.113.10', '/prueba/entrar').expect(429);

    await desde('203.0.113.77', '/prueba/entrar').expect(200);
  });

  it('cada ruta lleva su propio contador', async () => {
    for (let i = 0; i < 3; i++) await desde('203.0.113.10', '/prueba/entrar').expect(200);
    await desde('203.0.113.10', '/prueba/entrar').expect(429);

    await desde('203.0.113.10', '/prueba/recuperar').expect(200);
  });

  it('cada ruta usa su propio límite del entorno', async () => {
    await desde('203.0.113.10', '/prueba/recuperar').expect(200);
    await desde('203.0.113.10', '/prueba/recuperar').expect(200);

    await desde('203.0.113.10', '/prueba/recuperar').expect(429);
  });

  it('no limita las rutas sin el guardia', async () => {
    for (let i = 0; i < 20; i++) await request(app.getHttpServer()).get('/prueba/libre').expect(200);
  });

  it('LIMITE_POR_IP=desactivado apaga el límite', async () => {
    process.env.LIMITE_POR_IP = 'desactivado';

    for (let i = 0; i < 10; i++) await desde('203.0.113.10', '/prueba/entrar').expect(200);
  });
});
