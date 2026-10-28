import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { EmailService } from '../email/email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AvisosSstService } from './avisos-sst.service.js';

// Hoy es el 10 de junio de 2026 y la anticipación es de 15 días.
const HOY = new Date(2026, 5, 10, 9, 0);
const dia = (mes: number, diaDelMes: number, anio = 2026) => new Date(anio, mes - 1, diaDelMes);

const EMPRESA = { nombreComercial: 'Empresa de Prueba', colorPrimario: '#2563eb', telefonos: null, correo: null, diasAlertaSst: 15, correoAvisosSst: 'sst@ejemplo.test' };

const actividad = (id: string, fechaFin: Date, extra: object = {}) => ({
  id,
  anio: 2026,
  actividad: `Actividad ${id}`,
  meta: 'Meta de prueba',
  responsable: 'Responsable Inventado',
  correoResponsable: `${id}@ejemplo.test`,
  estado: 'PROGRAMADA',
  fechaFin,
  avisoProximaEn: null,
  avisoVencidaEn: null,
  ...extra,
});

const capacitacion = (id: string, fechaProgramada: Date, extra: object = {}) => ({
  id,
  tema: `Tema ${id}`,
  dirigidoA: 'Personal de obra',
  responsable: 'Facilitador Inventado',
  correoResponsable: `${id}@ejemplo.test`,
  estado: 'PROGRAMADA',
  fechaProgramada,
  avisoProximaEn: null,
  avisoVencidaEn: null,
  ...extra,
});

// Una entrega con la reposición dada.
const entrega = (id: string, trabajadorId: string, proximaReposicion: Date, extra: object = {}) => ({
  id,
  trabajadorId,
  elementoId: 'e-1',
  fecha: new Date(proximaReposicion.getFullYear(), proximaReposicion.getMonth(), proximaReposicion.getDate() - 30),
  proximaReposicion,
  anulada: false,
  createdAt: new Date(2026, 0, 1),
  avisoPorReponerEn: null,
  avisoVencidaEn: null,
  trabajador: { nombre: `Trabajador ${trabajadorId}`, documento: trabajadorId },
  elemento: { nombre: 'Casco de prueba' },
  ...extra,
});

function montar(configurado = true) {
  const tablas = {
    actividadPlan: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    capacitacion: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    entregaEpp: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    avisoSst: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  };
  const email = { estaConfigurado: vi.fn().mockReturnValue(configurado), enviar: vi.fn().mockResolvedValue(undefined) };
  const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue(EMPRESA) };
  const servicio = new AvisosSstService(tablas as unknown as PrismaService, email as unknown as EmailService, configuracion as unknown as ConfiguracionService);
  return { tablas, email, configuracion, servicio };
}

const historial = (m: ReturnType<typeof montar>) => m.tablas.avisoSst.create.mock.calls.map(([argumento]) => (argumento as { data: Record<string, unknown> }).data);

describe('AvisosSstService: actividades del plan (RF-SST-16)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('avisa al responsable cuando la actividad queda próxima y lo anota en el historial', async () => {
    m.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(6, 20))]);

    const r = await m.servicio.enviarPendientes(HOY);

    expect(r.actividades).toEqual({ enviados: 1, fallidos: 0, omitidos: 0 });
    expect(m.tablas.actividadPlan.updateMany).toHaveBeenCalledWith({ where: { id: 'a', avisoProximaEn: null }, data: { avisoProximaEn: expect.any(Date) } });
    expect(m.email.enviar).toHaveBeenCalledTimes(1);
    const correo = m.email.enviar.mock.calls[0][0];
    expect(correo.to).toBe('a@ejemplo.test');
    expect(correo.subject).toBe('Actividad del plan SST próxima a vencer: Actividad a');
    expect(correo.html).toContain('vence en 10 días');
    expect(historial(m)).toEqual([expect.objectContaining({ tipo: 'ACTIVIDAD_PLAN', estado: 'ENVIADA', destinatario: 'a@ejemplo.test', actividadPlanId: 'a', detalle: null })]);
  });

  it('avisa otra vez cuando se vence (un aviso por estado) y marca la columna de vencida', async () => {
    m.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(6, 1), { avisoProximaEn: new Date(2026, 5, 1) })]);

    await m.servicio.enviarPendientes(HOY);

    expect(m.tablas.actividadPlan.updateMany).toHaveBeenCalledWith({ where: { id: 'a', avisoVencidaEn: null }, data: { avisoVencidaEn: expect.any(Date) } });
    expect(m.email.enviar.mock.calls[0][0].subject).toBe('Actividad del plan SST vencida: Actividad a');
    expect(m.email.enviar.mock.calls[0][0].html).toContain('venció hace 9 días');
  });

  it('no repite un aviso que ya salió', async () => {
    m.tablas.actividadPlan.findMany.mockResolvedValue([
      actividad('proxima-avisada', dia(6, 20), { avisoProximaEn: new Date() }),
      actividad('vencida-avisada', dia(6, 1), { avisoProximaEn: new Date(), avisoVencidaEn: new Date() }),
    ]);
    const r = await m.servicio.enviarPendientes(HOY);
    expect(r.actividades).toEqual({ enviados: 0, fallidos: 0, omitidos: 0 });
    expect(m.email.enviar).not.toHaveBeenCalled();
    expect(m.tablas.actividadPlan.updateMany).not.toHaveBeenCalled();
  });

  it('una actividad al día no genera aviso, y la consulta deja fuera las ejecutadas y las canceladas', async () => {
    m.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(9, 30))]);
    const r = await m.servicio.enviarPendientes(HOY);
    expect(r.actividades.enviados).toBe(0);
    expect(m.tablas.actividadPlan.findMany.mock.calls[0][0].where.estado).toEqual({ notIn: ['EJECUTADA', 'CANCELADA'] });
  });

  it('si otro proceso ya reclamó el aviso, no lo envía otra vez', async () => {
    m.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(6, 20))]);
    m.tablas.actividadPlan.updateMany.mockResolvedValue({ count: 0 });
    const r = await m.servicio.enviarPendientes(HOY);
    expect(r.actividades.enviados).toBe(0);
    expect(m.email.enviar).not.toHaveBeenCalled();
  });

  it('si el correo falla, lo anota como fallido y libera el aviso para reintentar mañana', async () => {
    m.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(6, 20))]);
    m.email.enviar.mockRejectedValue(new Error('SMTP caído'));

    const r = await m.servicio.enviarPendientes(HOY);

    expect(r.actividades).toEqual({ enviados: 0, fallidos: 1, omitidos: 0 });
    expect(historial(m)).toEqual([expect.objectContaining({ estado: 'FALLIDA', detalle: 'SMTP caído' })]);
    expect(m.tablas.actividadPlan.updateMany).toHaveBeenLastCalledWith({ where: { id: 'a' }, data: { avisoProximaEn: null } });
  });

  it('un fallo al anotar el historial no deshace ni repite el correo ya enviado', async () => {
    m.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(6, 20))]);
    m.tablas.avisoSst.create.mockRejectedValue(new Error('base caída'));
    const r = await m.servicio.enviarPendientes(HOY);
    expect(r.actividades.enviados).toBe(1);
    expect(m.tablas.actividadPlan.updateMany).toHaveBeenCalledTimes(1);
  });

  it('sin servidor de correo no reclama nada, no envía, y anota UNA omisión del día', async () => {
    const sinCorreo = montar(false);
    sinCorreo.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(6, 20)), actividad('b', dia(6, 1))]);

    const r = await sinCorreo.servicio.enviarPendientes(HOY);

    expect(r.actividades).toEqual({ enviados: 0, fallidos: 0, omitidos: 2 });
    expect(sinCorreo.email.enviar).not.toHaveBeenCalled();
    expect(sinCorreo.tablas.actividadPlan.updateMany).not.toHaveBeenCalled();
    expect(historial(sinCorreo)).toEqual([expect.objectContaining({ tipo: 'ACTIVIDAD_PLAN', estado: 'OMITIDA', detalle: 'El correo de la empresa no está configurado', cantidad: 2 })]);
  });

  it('la omisión no se anota dos veces el mismo día', async () => {
    const sinCorreo = montar(false);
    sinCorreo.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(6, 20))]);
    sinCorreo.tablas.avisoSst.findFirst.mockResolvedValue({ id: 'ya-anotada' });
    await sinCorreo.servicio.enviarPendientes(HOY);
    expect(sinCorreo.tablas.avisoSst.create).not.toHaveBeenCalled();
  });

  it('con varias actividades, cada una recibe el suyo en su propio correo', async () => {
    m.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(6, 20)), actividad('b', dia(6, 1)), actividad('c', dia(9, 1))]);
    const r = await m.servicio.enviarPendientes(HOY);
    expect(r.actividades.enviados).toBe(2);
    expect(m.email.enviar.mock.calls.map(([c]) => c.to)).toEqual(['a@ejemplo.test', 'b@ejemplo.test']);
  });

  it('usa la anticipación configurada: con 5 días una actividad a 10 días no avisa', async () => {
    m.configuracion.obtenerEmpresa.mockResolvedValue({ ...EMPRESA, diasAlertaSst: 5 });
    m.tablas.actividadPlan.findMany.mockResolvedValue([actividad('a', dia(6, 20))]);
    expect((await m.servicio.enviarPendientes(HOY)).actividades.enviados).toBe(0);
  });
});

describe('AvisosSstService: capacitaciones (RF-SST-20)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('avisa al facilitador cuando la capacitación queda próxima, con la fecha programada', async () => {
    m.tablas.capacitacion.findMany.mockResolvedValue([capacitacion('c', dia(6, 15))]);
    const r = await m.servicio.enviarPendientes(HOY);
    expect(r.capacitaciones).toEqual({ enviados: 1, fallidos: 0, omitidos: 0 });
    expect(m.tablas.capacitacion.updateMany).toHaveBeenCalledWith({ where: { id: 'c', avisoProximaEn: null }, data: { avisoProximaEn: expect.any(Date) } });
    expect(m.email.enviar.mock.calls[0][0]).toMatchObject({ to: 'c@ejemplo.test', subject: 'Capacitación SST próxima: Tema c' });
    expect(historial(m)).toEqual([expect.objectContaining({ tipo: 'CAPACITACION', estado: 'ENVIADA', capacitacionId: 'c' })]);
  });

  it('avisa que está sin ejecutar cuando la fecha programada ya pasó, una sola vez', async () => {
    m.tablas.capacitacion.findMany.mockResolvedValue([capacitacion('c', dia(6, 1), { avisoProximaEn: new Date() })]);
    await m.servicio.enviarPendientes(HOY);
    expect(m.email.enviar.mock.calls[0][0].subject).toBe('Capacitación SST sin ejecutar: Tema c');

    const otra = montar();
    otra.tablas.capacitacion.findMany.mockResolvedValue([capacitacion('c', dia(6, 1), { avisoProximaEn: new Date(), avisoVencidaEn: new Date() })]);
    await otra.servicio.enviarPendientes(HOY);
    expect(otra.email.enviar).not.toHaveBeenCalled();
  });

  it('si el correo falla, libera el aviso y lo anota como fallido', async () => {
    m.tablas.capacitacion.findMany.mockResolvedValue([capacitacion('c', dia(6, 15))]);
    m.email.enviar.mockRejectedValue(new Error('SMTP caído'));
    const r = await m.servicio.enviarPendientes(HOY);
    expect(r.capacitaciones.fallidos).toBe(1);
    expect(m.tablas.capacitacion.updateMany).toHaveBeenLastCalledWith({ where: { id: 'c' }, data: { avisoProximaEn: null } });
  });

  it('las ejecutadas y canceladas quedan fuera de la consulta', async () => {
    await m.servicio.enviarPendientes(HOY);
    expect(m.tablas.capacitacion.findMany.mock.calls[0][0].where.estado).toEqual({ notIn: ['EJECUTADA', 'CANCELADA'] });
  });
});

describe('AvisosSstService: resumen de EPP por reponer (RF-SST-14)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('manda UN correo con lo vencido y lo por reponer, y marca cada entrega como avisada', async () => {
    m.tablas.entregaEpp.findMany.mockResolvedValue([
      entrega('v', 't-vencido', dia(6, 1)),
      entrega('p1', 't-por-reponer-1', dia(6, 20)),
      entrega('p2', 't-por-reponer-2', dia(6, 24)),
      entrega('ok', 't-vigente', dia(9, 1)),
    ]);

    const r = await m.servicio.enviarPendientes(HOY);

    expect(r.epp).toEqual({ enviados: 1, fallidos: 0, omitidos: 0 });
    expect(m.email.enviar).toHaveBeenCalledTimes(1);
    const correo = m.email.enviar.mock.calls[0][0];
    expect(correo.to).toBe('sst@ejemplo.test');
    expect(correo.subject).toBe('Elementos de protección personal: 1 vencido y 2 por reponer');
    expect(correo.html).toContain('Trabajador t-vencido');
    expect(correo.html).not.toContain('Trabajador t-vigente');
    expect(m.tablas.entregaEpp.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['v'] }, avisoVencidaEn: null }, data: { avisoVencidaEn: expect.any(Date) } });
    expect(m.tablas.entregaEpp.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1', 'p2'] }, avisoPorReponerEn: null }, data: { avisoPorReponerEn: expect.any(Date) } });
    expect(historial(m)).toEqual([expect.objectContaining({ tipo: 'EPP', estado: 'ENVIADA', destinatario: 'sst@ejemplo.test', cantidad: 3 })]);
  });

  it('no incluye lo que ya se avisó: solo lo que entró en un estado nuevo desde el último correo', async () => {
    m.tablas.entregaEpp.findMany.mockResolvedValue([
      entrega('v-avisada', 't-1', dia(6, 1), { avisoVencidaEn: new Date() }),
      entrega('p-avisada', 't-2', dia(6, 20), { avisoPorReponerEn: new Date() }),
      entrega('p-nueva', 't-3', dia(6, 22)),
    ]);
    await m.servicio.enviarPendientes(HOY);
    expect(m.email.enviar.mock.calls[0][0].subject).toBe('Elementos de protección personal: 1 por reponer');
  });

  it('si no hay nada nuevo no manda ningún correo', async () => {
    m.tablas.entregaEpp.findMany.mockResolvedValue([entrega('ok', 't-1', dia(9, 1)), entrega('v-avisada', 't-2', dia(6, 1), { avisoVencidaEn: new Date() })]);
    const r = await m.servicio.enviarPendientes(HOY);
    expect(r.epp).toEqual({ enviados: 0, fallidos: 0, omitidos: 0 });
    expect(m.email.enviar).not.toHaveBeenCalled();
  });

  it('una reposición reciente reinicia el reloj: la entrega vieja vencida ya no se avisa', async () => {
    m.tablas.entregaEpp.findMany.mockResolvedValue([
      entrega('vieja', 't-1', dia(5, 1), { fecha: dia(4, 1) }),
      entrega('nueva', 't-1', dia(7, 30), { fecha: dia(6, 5) }),
    ]);
    await m.servicio.enviarPendientes(HOY);
    expect(m.email.enviar).not.toHaveBeenCalled();
  });

  it('sin "correo de avisos SST" no envía nada y ni siquiera consulta (las alertas quedan solo en el panel)', async () => {
    m.configuracion.obtenerEmpresa.mockResolvedValue({ ...EMPRESA, correoAvisosSst: null });
    const r = await m.servicio.enviarPendientes(HOY);
    expect(r.epp).toEqual({ enviados: 0, fallidos: 0, omitidos: 0 });
    expect(m.tablas.entregaEpp.findMany).not.toHaveBeenCalled();
  });

  it('solo mira entregas no anuladas de trabajadores y elementos activos', async () => {
    await m.servicio.enviarPendientes(HOY);
    expect(m.tablas.entregaEpp.findMany.mock.calls[0][0].where).toEqual({ anulada: false, trabajador: { estado: 'ACTIVO' }, elemento: { activo: true } });
  });

  it('si el correo falla, libera las entregas para reintentar mañana y anota el fallo', async () => {
    m.tablas.entregaEpp.findMany.mockResolvedValue([entrega('v', 't-1', dia(6, 1)), entrega('p', 't-2', dia(6, 20))]);
    m.email.enviar.mockRejectedValue(new Error('SMTP caído'));

    const r = await m.servicio.enviarPendientes(HOY);

    expect(r.epp).toEqual({ enviados: 0, fallidos: 1, omitidos: 0 });
    expect(m.tablas.entregaEpp.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['v'] } }, data: { avisoVencidaEn: null } });
    expect(m.tablas.entregaEpp.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['p'] } }, data: { avisoPorReponerEn: null } });
    expect(historial(m)).toEqual([expect.objectContaining({ estado: 'FALLIDA', detalle: 'SMTP caído' })]);
  });

  it('sin servidor de correo no reclama nada y anota una omisión del día', async () => {
    const sinCorreo = montar(false);
    sinCorreo.tablas.entregaEpp.findMany.mockResolvedValue([entrega('v', 't-1', dia(6, 1))]);
    const r = await sinCorreo.servicio.enviarPendientes(HOY);
    expect(r.epp).toEqual({ enviados: 0, fallidos: 0, omitidos: 1 });
    expect(sinCorreo.tablas.entregaEpp.updateMany).not.toHaveBeenCalled();
    expect(historial(sinCorreo)).toEqual([expect.objectContaining({ tipo: 'EPP', estado: 'OMITIDA', cantidad: 1 })]);
  });
});

describe('AvisosSstService: orquestación y consulta', () => {
  it('si una parte falla, las demás se hacen igual', async () => {
    const m = montar();
    m.tablas.actividadPlan.findMany.mockRejectedValue(new Error('base caída'));
    m.tablas.capacitacion.findMany.mockResolvedValue([capacitacion('c', dia(6, 15))]);

    const r = await m.servicio.enviarPendientes(HOY);

    expect(r.actividades).toEqual({ enviados: 0, fallidos: 0, omitidos: 0 });
    expect(r.capacitaciones.enviados).toBe(1);
  });

  it('el proceso programado nunca lanza una excepción, aunque todo falle', async () => {
    const m = montar();
    m.configuracion.obtenerEmpresa.mockRejectedValue(new Error('sin configuración'));
    await expect(m.servicio.ejecutarProgramado()).resolves.toBeUndefined();
  });

  it('el historial se lista del más reciente al más antiguo y respeta los filtros', async () => {
    const m = montar();
    await m.servicio.listarAvisos({ tipo: 'EPP', estado: 'FALLIDA' }, 50);
    const consulta = m.tablas.avisoSst.findMany.mock.calls[0][0];
    expect(consulta).toMatchObject({ where: { tipo: 'EPP', estado: 'FALLIDA' }, orderBy: { createdAt: 'desc' }, take: 50 });
  });
});
