import type { UsuarioAutenticado } from '../../src/auth/usuario-autenticado.js';
import type { TipoEntidadSS } from '../../src/generated/prisma/enums.js';
import type { Contexto } from './contexto.js';
import { despues, hace, hoy } from './fechas.js';

// ---------------------------------------------------------------------------------------------
// Datos de demostración del módulo de seguridad y salud en el trabajo (CC-03). Todo inventado y armado con los servicios
// reales, con fechas relativas a hoy: así siempre hay una entrega al día, una por reponer y una vencida, actividades
// próximas y vencidas, y una capacitación con asistencia. Los correos de los responsables son de dominio .test.
// ---------------------------------------------------------------------------------------------

const log = (texto: string) => console.log(`  · ${texto}`);

export interface ParametrosSst {
  gerente: UsuarioAutenticado;
  admin: UsuarioAutenticado;
  emailContratista: string;
  passwordContratista: string;
}

export async function cargarSst(ctx: Contexto, { gerente, admin, emailContratista, passwordContratista }: ParametrosSst): Promise<void> {
  // ---- El contratista externo ----
  const rolContratista = await ctx.prisma.rolUsuario.findUniqueOrThrow({ where: { clave: 'CONTRATISTA_SST' } });
  await ctx.usuarios.crear(
    { nombre: 'Contratista SST (demostración)', email: emailContratista, password: passwordContratista, rolId: rolContratista.id, todosLosProyectos: true, proyectoIds: [] },
    gerente,
  );

  // ---- Ficha ampliada: nombres, apellidos, área y demás datos (todos inventados) ----
  const personal = await ctx.prisma.trabajador.findMany({ orderBy: { createdAt: 'asc' }, take: 6 });
  const sexos = ['FEMENINO', 'MASCULINO', 'FEMENINO', 'MASCULINO', 'FEMENINO', 'MASCULINO'] as const;
  const areas = ['Obra', 'Obra', 'Obra', 'Obra', 'Obra', 'Seguridad'];
  for (const [i, t] of personal.entries()) {
    // Los apellidos del demo son dos palabras sueltas al final del nombre completo.
    const palabras = t.nombre.split(' ');
    await ctx.trabajadores.actualizar(
      t.id,
      {
        nombres: palabras.slice(0, -2).join(' '),
        apellidos: palabras.slice(-2).join(' '),
        sexo: sexos[i],
        area: areas[i],
        fechaNacimiento: `${1980 + i * 3}-0${i + 2}-1${i}`,
        celular: `31000000${String(10 + i)}`,
        email: `trabajador${i + 1}@ejemplo.test`,
      },
      admin,
    );
  }

  // ---- Afiliaciones: unos trabajadores completos y otros con pendientes ----
  const trabajadores = personal;
  const entidad = async (tipo: TipoEntidadSS, posicion: number) => {
    const lista = await ctx.prisma.entidadSS.findMany({ where: { tipo, activa: true }, orderBy: { nombre: 'asc' } });
    return lista[posicion % lista.length];
  };
  const claseRiesgo = await ctx.prisma.claseRiesgoArl.findUniqueOrThrow({ where: { clase: 3 } });
  const tiposPorTrabajador: TipoEntidadSS[][] = [
    ['EPS', 'AFP', 'CESANTIAS', 'ARL', 'CAJA'],
    ['EPS', 'AFP', 'CESANTIAS', 'ARL', 'CAJA'],
    ['EPS', 'AFP', 'ARL'],
    ['EPS', 'ARL'],
    ['EPS'],
    [],
  ];
  for (const [i, trabajador] of trabajadores.entries()) {
    for (const tipo of tiposPorTrabajador[i] ?? []) {
      const e = await entidad(tipo, i);
      await ctx.afiliaciones.registrar(
        trabajador.id,
        { tipo, entidadId: e.id, ...(tipo === 'ARL' ? { claseRiesgoId: claseRiesgo.id } : {}), fechaInicio: trabajador.fechaIngreso.toISOString().slice(0, 10) },
        admin,
      );
    }
  }
  for (const trabajador of trabajadores.slice(0, 4)) await ctx.trabajadores.registrarAutorizacionSalud(trabajador.id, { autoriza: true }, admin);
  log('Afiliaciones de 5 trabajadores (dos completos) y autorización de datos de salud de 4');

  // ---- EPP: una entrega vigente, una por reponer y una vencida ----
  const elementos = await ctx.prisma.elementoEpp.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });
  const conVida = (maxDias: number) => elementos.find((e) => e.vidaUtilDias <= maxDias && e.vidaUtilDias >= 60);
  const largo = elementos.find((e) => e.vidaUtilDias >= 300) ?? elementos[0];
  const medio = conVida(200) ?? elementos[1];
  const corto = elementos.find((e) => e.vidaUtilDias < 60) ?? elementos[2];
  const entregas = [
    { t: 0, e: largo, fecha: hace(20), motivo: 'DOTACION_INICIAL' as const, talla: 'Talla M' },
    { t: 0, e: medio, fecha: hace(Math.max(1, medio.vidaUtilDias - 8)), motivo: 'DOTACION_INICIAL' as const, talla: 'Talla 42' },
    { t: 1, e: corto, fecha: hace(corto.vidaUtilDias + 12), motivo: 'DOTACION_INICIAL' as const, talla: 'Única' },
    { t: 1, e: largo, fecha: hace(35), motivo: 'DOTACION_INICIAL' as const, talla: 'Talla L' },
    { t: 2, e: medio, fecha: hace(10), motivo: 'DOTACION_INICIAL' as const, talla: 'Talla 40' },
  ];
  for (const x of entregas) {
    await ctx.epp.registrarEntrega(
      { trabajadorId: trabajadores[x.t].id, elementoId: x.e.id, fecha: x.fecha, cantidad: 1, tallaReferencia: x.talla, motivo: x.motivo, entregadoPor: 'Almacén de obra', firmoRecibido: true },
      admin,
    );
  }
  log('5 entregas de EPP (vigentes, por reponer y vencidas)');

  // ---- Plan de trabajo anual ----
  const anio = Number(hoy().slice(0, 4));
  const dentroDelAnio = (iso: string) => (iso > `${anio}-12-31` ? `${anio}-12-31` : iso < `${anio}-01-01` ? `${anio}-01-01` : iso);
  const correo = 'responsable.sst@ejemplo.test';
  const actividades = [
    { ciclo: 'PLANEAR', estandar: 'Política y objetivos de SST', actividad: 'Revisar y firmar la política de seguridad y salud', meta: 'Política firmada y divulgada al 100 % del personal', responsable: 'Gerencia (demostración)', inicio: `${anio}-01-10`, fin: `${anio}-02-15`, estado: 'EJECUTADA', avance: 100 },
    { ciclo: 'PLANEAR', estandar: 'Identificación de peligros', actividad: 'Actualizar la identificación de peligros de cada obra', meta: 'Una matriz actualizada por obra', responsable: 'Contratista SST (demostración)', inicio: `${anio}-03-01`, fin: `${anio}-04-30`, estado: 'EJECUTADA', avance: 100 },
    { ciclo: 'HACER', estandar: 'Elementos de protección personal', actividad: 'Entregar dotación y EPP al personal nuevo', meta: '100 % del personal con EPP entregado', responsable: 'Almacén de obra (demostración)', inicio: hace(60), fin: despues(9), estado: 'EN_EJECUCION', avance: 60 },
    { ciclo: 'HACER', estandar: 'Capacitación', actividad: 'Jornada de pausas activas y orden y aseo', meta: 'Una jornada por mes en cada obra', responsable: 'Contratista SST (demostración)', inicio: hace(45), fin: hace(12), estado: 'PROGRAMADA', avance: 20 },
    { ciclo: 'VERIFICAR', estandar: 'Inspecciones', actividad: 'Inspección de herramientas y andamios', meta: 'Inspección trimestral registrada', responsable: 'Maestro de obra (demostración)', inicio: despues(20), fin: despues(50), estado: 'PROGRAMADA', avance: 0 },
    { ciclo: 'ACTUAR', estandar: 'Mejora continua', actividad: 'Auditoría interna del sistema de gestión', meta: 'Informe con plan de acción', responsable: 'Gerencia (demostración)', inicio: `${anio}-11-15`, fin: `${anio}-12-15`, estado: 'PROGRAMADA', avance: 0 },
  ] as const;
  for (const a of actividades) {
    await ctx.planSst.crear(
      {
        anio,
        ciclo: a.ciclo,
        estandar: a.estandar,
        actividad: a.actividad,
        meta: a.meta,
        responsable: a.responsable,
        correoResponsable: correo,
        fechaInicio: dentroDelAnio(a.inicio),
        fechaFin: dentroDelAnio(a.fin),
        estado: a.estado,
        porcentajeAvance: a.avance,
      },
      admin,
    );
  }
  log(`Plan de trabajo ${anio} con ${actividades.length} actividades (ejecutadas, en curso, próxima y vencida)`);

  // ---- Capacitaciones ----
  const ejecutada = await ctx.capacitaciones.crear(
    {
      tema: 'Trabajo seguro en alturas',
      objetivo: 'Reconocer los riesgos del trabajo en alturas y usar bien el arnés y la línea de vida',
      dirigidoA: 'Oficiales y ayudantes de obra',
      modalidad: 'PRESENCIAL',
      horas: 4,
      fechaProgramada: hace(30),
      fechaEjecucion: hace(30),
      responsable: 'Contratista SST (demostración)',
      correoResponsable: correo,
      ejecutor: 'EXTERNO',
      asistentesProgramados: 6,
      estado: 'EJECUTADA',
      evaluacionEficacia: 4,
    },
    admin,
  );
  await ctx.capacitaciones.registrarAsistentes(
    ejecutada.id,
    { asistentes: trabajadores.slice(0, 4).map((t, i) => ({ trabajadorId: t.id, firmo: true, calificacion: [4.5, 4, 3.8, 5][i] })) },
    admin,
  );
  await ctx.capacitaciones.crear(
    {
      tema: 'Uso y cuidado de los elementos de protección personal',
      objetivo: 'Que cada trabajador sepa elegir, usar, guardar y reportar el daño de su EPP',
      dirigidoA: 'Todo el personal de obra',
      modalidad: 'PRESENCIAL',
      horas: 2,
      fechaProgramada: despues(8),
      responsable: 'Contratista SST (demostración)',
      correoResponsable: correo,
      ejecutor: 'ARL',
      asistentesProgramados: 20,
    },
    admin,
  );
  await ctx.capacitaciones.crear(
    {
      tema: 'Primeros auxilios básicos',
      objetivo: 'Actuar bien en los primeros minutos ante una lesión en la obra',
      dirigidoA: 'Maestros de obra y celadores',
      modalidad: 'MIXTA',
      horas: 6,
      fechaProgramada: hace(9),
      responsable: 'Contratista SST (demostración)',
      correoResponsable: correo,
      ejecutor: 'EXTERNO',
      asistentesProgramados: 8,
    },
    admin,
  );
  log('3 capacitaciones (una ejecutada con 4 asistentes, una próxima y una vencida)');
}
