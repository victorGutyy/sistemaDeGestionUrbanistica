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

const RUTAS_PROTEGIDAS: [metodo: 'get' | 'post' | 'put' | 'patch' | 'delete', ruta: string][] = [
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
  ['post', `/ventas/${ID}/desistir`],
  ['post', `/ventas/${ID}/documentos`],
  ['get', `/ventas/${ID}/documentos/${ID}`],
  ['post', `/ventas/${ID}/rechazar`],
  ['get', '/abonos'],
  ['post', '/abonos'],
  ['get', `/abonos/${ID}/comprobante`],
  ['get', `/abonos/${ID}/recibo`],
  ['post', `/abonos/${ID}/anular`],
  ['get', '/recibos'],
  ['get', '/auditoria'],
  ['get', '/auditoria/catalogo'],
  ['get', '/equipos'],
  ['get', '/equipos/tipos'],
  ['post', '/equipos'],
  ['get', `/equipos/${ID}`],
  ['patch', `/equipos/${ID}`],
  ['post', `/equipos/${ID}/baja`],
  ['post', `/equipos/${ID}/reactivar`],
  ['post', '/configuracion/tipos-equipo'],
  ['patch', `/configuracion/tipos-equipo/${ID}`],
  ['get', '/exportacion/completa'],
  ['get', `/clientes/${ID}/estado-cuenta`],
  ['patch', `/clientes/${ID}`],
  ['get', '/importacion'],
  ['get', '/importacion/plantilla'],
  ['post', '/importacion/validar'],
  ['post', '/importacion/confirmar'],
  ['get', '/importacion/sst'],
  ['get', '/importacion/sst/plantilla'],
  ['post', '/importacion/sst/validar'],
  ['post', '/importacion/sst/confirmar'],
  ['get', `/importacion/${ID}`],
  ['get', `/importacion/${ID}/conciliacion`],
  ['get', '/cartera'],
  ['get', '/cierres-caja'],
  ['get', '/cierres-caja/proximo'],
  ['get', `/cierres-caja/${ID}`],
  ['get', `/cierres-caja/${ID}/pdf`],
  ['post', '/cierres-caja'],
  ['post', `/cierres-caja/${ID}/cerrar`],
  ['post', `/cierres-caja/${ID}/aprobar`],
  ['post', `/cierres-caja/${ID}/devolver`],
  ['delete', `/cierres-caja/${ID}`],
  ['get', '/cartera/reporte'],
  ['get', '/finanzas/movimientos'],
  ['post', '/finanzas/movimientos'],
  ['get', `/finanzas/movimientos/${ID}`],
  ['post', `/finanzas/movimientos/${ID}/anular`],
  ['get', `/finanzas/movimientos/${ID}/soporte`],
  ['get', `/finanzas/proyectos/${ID}`],
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
  ['post', '/configuracion/categorias-ingreso'],
  ['patch', `/configuracion/categorias-ingreso/${ID}`],
  ['put', '/configuracion/comisiones/REFERIDO'],
  ['get', '/trabajadores/sst'],
  ['get', '/trabajadores/alertas-sst'],
  ['get', `/trabajadores/${ID}/ficha-sst`],
  ['patch', `/trabajadores/${ID}`],
  ['post', `/trabajadores/${ID}/retiro`],
  ['post', `/trabajadores/${ID}/reactivar`],
  ['put', `/trabajadores/${ID}/autorizacion-salud`],
  ['get', `/trabajadores/${ID}/afiliaciones`],
  ['post', `/trabajadores/${ID}/afiliaciones`],
  ['post', `/trabajadores/${ID}/afiliaciones/${ID}/cerrar`],
  ['get', `/trabajadores/${ID}/documentos`],
  ['post', `/trabajadores/${ID}/documentos`],
  ['get', `/trabajadores/${ID}/documentos/${ID}`],
  ['get', '/sst/epp/elementos'],
  ['post', '/sst/epp/elementos'],
  ['patch', `/sst/epp/elementos/${ID}`],
  ['get', '/sst/epp/reposiciones'],
  ['get', '/sst/epp/entregas'],
  ['post', '/sst/epp/entregas'],
  ['get', `/sst/epp/entregas/${ID}`],
  ['post', `/sst/epp/entregas/${ID}/anular`],
  ['post', `/sst/epp/entregas/${ID}/firma`],
  ['get', `/sst/epp/entregas/${ID}/documentos`],
  ['post', `/sst/epp/entregas/${ID}/documentos`],
  ['get', `/sst/epp/entregas/${ID}/documentos/${ID}`],
  ['get', '/sst/resumen'],
  ['get', '/sst/avisos'],
  ['post', '/sst/avisos/ejecutar'],
  ['get', '/sst/plan'],
  ['post', '/sst/plan'],
  ['post', '/sst/plan/copiar'],
  ['get', `/sst/plan/${ID}`],
  ['patch', `/sst/plan/${ID}`],
  ['get', `/sst/plan/${ID}/documentos`],
  ['post', `/sst/plan/${ID}/documentos`],
  ['get', `/sst/plan/${ID}/documentos/${ID}`],
  ['get', '/sst/capacitaciones'],
  ['post', '/sst/capacitaciones'],
  ['get', `/sst/capacitaciones/${ID}`],
  ['patch', `/sst/capacitaciones/${ID}`],
  ['post', `/sst/capacitaciones/${ID}/asistencias`],
  ['patch', `/sst/capacitaciones/${ID}/asistencias/${ID}`],
  ['post', `/sst/capacitaciones/${ID}/asistencias/${ID}/anular`],
  ['get', `/sst/capacitaciones/${ID}/documentos`],
  ['post', `/sst/capacitaciones/${ID}/documentos`],
  ['get', `/sst/capacitaciones/${ID}/documentos/${ID}`],
  ['get', '/sst/ausentismo/tipos'],
  ['post', '/sst/ausentismo/tipos'],
  ['patch', `/sst/ausentismo/tipos/${ID}`],
  ['get', '/sst/ausentismo/diagnosticos'],
  ['post', '/sst/ausentismo/diagnosticos'],
  ['patch', `/sst/ausentismo/diagnosticos/${ID}`],
  ['get', '/sst/ausentismo'],
  ['get', '/sst/ausentismo/resumen'],
  ['get', '/sst/ausentismo/recobros'],
  ['get', '/sst/ausentismo/novedades'],
  ['get', '/sst/ausentismo/novedades/excel'],
  ['get', '/sst/ausentismo/novedades-del-periodo'],
  ['get', '/sst/reportes'],
  ['get', '/sst/reportes/sst-plan'],
  ['get', '/sst/reportes/sst-plan/exportar'],
  ['patch', `/sst/ausentismo/${ID}/recobros/EPS`],
  ['post', '/sst/ausentismo'],
  ['get', `/sst/ausentismo/${ID}`],
  ['patch', `/sst/ausentismo/${ID}`],
  ['post', `/sst/ausentismo/${ID}/anular`],
  ['post', `/sst/ausentismo/${ID}/correccion`],
  ['get', `/sst/ausentismo/${ID}/documentos`],
  ['post', `/sst/ausentismo/${ID}/documentos`],
  ['get', `/sst/ausentismo/${ID}/documentos/${ID}`],
  ['get', '/seguridad-social/catalogos'],
  ['post', '/seguridad-social/parametros-legales'],
  ['patch', `/seguridad-social/parametros-legales/${ID}`],
  ['post', `/seguridad-social/parametros-legales/${ID}/validar`],
  ['post', '/seguridad-social/entidades'],
  ['patch', `/seguridad-social/entidades/${ID}`],
  ['patch', `/seguridad-social/clases-riesgo/${ID}`],
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
