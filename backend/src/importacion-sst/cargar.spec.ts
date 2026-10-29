import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilaLeida, LibroLeido } from '../importacion/leer-libro.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { cargarLibroSst, mensajeDelError, type ServiciosDeCarga } from './cargar.js';
import type { ClaveHojaSst } from './plantilla-sst-definicion.js';

// Los identificadores son UUID de verdad porque los DTO de siempre los exigen (la carga también los aplica como red de seguridad).
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TRABAJADOR_ID = ID(1);
const TIPO_GENERAL = ID(10);
const TIPO_LUTO = ID(11);
const ELEMENTO_CASCO = ID(20);
const CAPACITACION_ID = ID(30);
const DIAGNOSTICO_ID = ID(40);

const USUARIO = { id: ID(99), email: 'gerente@ejemplo.test', nombre: 'Gerente Inventado', permisos: [], proyectoIds: null, rol: { id: 'r', clave: 'GERENTE', nombre: 'Gerente' } } as unknown as UsuarioAutenticado;
const HOY = new Date(2026, 9, 29);

const fila = (numero: number, celdas: FilaLeida['celdas']): FilaLeida => ({ fila: numero, celdas });
function libro(hojas: Partial<Record<ClaveHojaSst, FilaLeida[]>>, problemas: LibroLeido<ClaveHojaSst>['problemas'] = []): LibroLeido<ClaveHojaSst> {
  const claves: ClaveHojaSst[] = ['trabajadores', 'ausentismos', 'entregasEpp', 'asistencias'];
  return {
    hojas: Object.fromEntries(claves.map((clave) => [clave, { clave, presente: (hojas[clave]?.length ?? 0) > 0, filas: hojas[clave] ?? [] }])) as LibroLeido<ClaveHojaSst>['hojas'],
    problemas,
  };
}

const TRABAJADOR_NUEVO = { documento: '1000000001', nombres: 'Persona', apellidos: 'Inventada', cargo: 'Oficial', salarioBase: '1750905', fechaIngreso: '15/01/2026' };
const AUSENTISMO = { documento: '1000000001', tipo: 'Enfermedad general', fechaInicio: '10/03/2026', fechaFin: '14/03/2026', cie10: 'M54.5' };
const ENTREGA = { documento: '1000000001', elemento: 'Casco de seguridad', fecha: '05/03/2026', cantidad: 1, motivo: 'Dotación inicial' };
const ASISTENCIA = { documento: '1000000001', tema: 'Trabajo seguro en alturas', fechaProgramada: '10/04/2026' };

function montar() {
  const orden: string[] = [];
  const db = {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      orden.push(sql);
      return 0;
    }),
    trabajador: { findUnique: vi.fn().mockResolvedValue(null) },
    tipoAusentismo: {
      findMany: vi.fn().mockResolvedValue([
        { id: TIPO_GENERAL, codigo: 'ENFERMEDAD_GENERAL', nombre: 'Enfermedad general', activo: true },
        { id: TIPO_LUTO, codigo: 'LUTO', nombre: 'Licencia por luto', activo: true },
      ]),
    },
    elementoEpp: { findMany: vi.fn().mockResolvedValue([{ id: ELEMENTO_CASCO, nombre: 'Casco de seguridad' }]) },
    diagnosticoCie10: { findUnique: vi.fn(async ({ where }: { where: { codigo: string } }) => (where.codigo === 'M54.5' ? { id: DIAGNOSTICO_ID } : null)) },
    capacitacion: { findMany: vi.fn().mockResolvedValue([{ id: CAPACITACION_ID, tema: 'Trabajo seguro en alturas' }]) },
  };
  const servicios = {
    trabajadores: { crearEnTx: vi.fn(async () => (orden.push('crear trabajador'), { id: TRABAJADOR_ID, nombre: 'Persona Inventada' })) },
    ausentismo: { registrarEnTx: vi.fn(async () => (orden.push('registrar ausentismo'), { id: ID(50) })) },
    epp: { registrarEntregaEnTx: vi.fn(async () => (orden.push('registrar entrega'), {})) },
    capacitaciones: { registrarAsistentesEnTx: vi.fn(async () => (orden.push('registrar asistencia'), { registrados: 1, omitidos: 0 })) },
  };
  const cargar = (l: LibroLeido<ClaveHojaSst>) => cargarLibroSst(db as never, l, servicios as unknown as ServiciosDeCarga, USUARIO, HOY);
  return { db, servicios, orden, cargar };
}

describe('cargarLibroSst: trabajadores (RF-SST-23)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('crea el trabajador nuevo con los datos de la fila y lo cuenta', async () => {
    const r = await m.cargar(libro({ trabajadores: [fila(2, TRABAJADOR_NUEVO)] }));
    expect(r.errores).toEqual([]);
    expect(r.resumen.trabajadores).toEqual({ nuevos: 1, existentes: 0 });
    expect(m.servicios.trabajadores.crearEnTx).toHaveBeenCalledWith(m.db, expect.objectContaining({ documento: '1000000001', nombres: 'Persona', apellidos: 'Inventada', cargo: 'Oficial', salarioBase: '1750905', fechaIngreso: '2026-01-15' }), USUARIO);
  });

  it('un trabajador que ya existe se reutiliza sin modificar y se avisa', async () => {
    m.db.trabajador.findUnique.mockResolvedValue({ id: TRABAJADOR_ID, nombre: 'Persona Inventada' });
    const r = await m.cargar(libro({ trabajadores: [fila(2, TRABAJADOR_NUEVO)] }));
    expect(r.errores).toEqual([]);
    expect(r.resumen.trabajadores).toEqual({ nuevos: 0, existentes: 1 });
    expect(r.avisos[0]).toMatchObject({ hoja: 'Trabajadores', fila: 2, mensaje: expect.stringMatching(/Ya existe un trabajador con el documento 1000000001/) });
    expect(m.servicios.trabajadores.crearEnTx).not.toHaveBeenCalled();
  });

  it('el mismo documento dos veces en la hoja es un error en la segunda fila', async () => {
    const r = await m.cargar(libro({ trabajadores: [fila(2, TRABAJADOR_NUEVO), fila(3, TRABAJADOR_NUEVO)] }));
    expect(r.errores).toEqual([expect.objectContaining({ hoja: 'Trabajadores', fila: 3, mensaje: 'El documento 1000000001 ya aparece en la fila 2 de esta hoja' })]);
    expect(m.servicios.trabajadores.crearEnTx).toHaveBeenCalledTimes(1);
  });

  it('un problema de lectura de la fila se informa y no llega al servicio', async () => {
    const r = await m.cargar(libro({ trabajadores: [fila(2, { ...TRABAJADOR_NUEVO, salarioBase: 'mucho' })] }));
    expect(r.errores).toEqual([expect.objectContaining({ hoja: 'Trabajadores', fila: 2, columna: 'Salario base' })]);
    expect(m.servicios.trabajadores.crearEnTx).not.toHaveBeenCalled();
  });
});

describe('cargarLibroSst: puntos de guardado por fila', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('una fila buena abre y cierra su punto de guardado, sin deshacer nada', async () => {
    await m.cargar(libro({ trabajadores: [fila(2, TRABAJADOR_NUEVO)] }));
    expect(m.orden).toEqual(['SAVEPOINT fila_carga_sst', 'crear trabajador', 'RELEASE SAVEPOINT fila_carga_sst']);
  });

  it('una fila que falla se deshace sola, con el mensaje del servicio, y las demás siguen', async () => {
    m.servicios.trabajadores.crearEnTx.mockRejectedValueOnce(new ConflictException('Ya existe un trabajador con el documento 1000000001'));
    const r = await m.cargar(libro({ trabajadores: [fila(2, TRABAJADOR_NUEVO), fila(3, { ...TRABAJADOR_NUEVO, documento: '1000000002' })] }));
    expect(r.errores).toEqual([expect.objectContaining({ hoja: 'Trabajadores', fila: 2, mensaje: 'Ya existe un trabajador con el documento 1000000001' })]);
    expect(r.resumen.trabajadores.nuevos).toBe(1);
    expect(m.orden).toEqual([
      'SAVEPOINT fila_carga_sst',
      'ROLLBACK TO SAVEPOINT fila_carga_sst',
      'RELEASE SAVEPOINT fila_carga_sst',
      'SAVEPOINT fila_carga_sst',
      'crear trabajador',
      'RELEASE SAVEPOINT fila_carga_sst',
    ]);
  });

  it('un error interno no se muestra tal cual: se avisa sin detalles técnicos', async () => {
    m.servicios.trabajadores.crearEnTx.mockRejectedValueOnce(new Error('Invalid `prisma.trabajador.create()` invocation: connection string postgres://usuario:clave@host'));
    const r = await m.cargar(libro({ trabajadores: [fila(2, TRABAJADOR_NUEVO)] }));
    expect(r.errores[0].mensaje).toMatch(/error interno/);
    expect(JSON.stringify(r.errores)).not.toMatch(/postgres|clave|prisma/i);
  });

  it('el traslape que detecta la base de datos se muestra con su mensaje de siempre', () => {
    expect(mensajeDelError(new Error('Invalid prisma.ausentismo.create(): El trabajador ya tiene un ausentismo en esas fechas'))).toBe('El trabajador ya tiene un ausentismo en esas fechas');
  });
});

describe('cargarLibroSst: ausentismos', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
    m.db.trabajador.findUnique.mockResolvedValue({ id: TRABAJADOR_ID, nombre: 'Persona Inventada' });
  });

  it('registra el ausentismo con el trabajador, el tipo y el diagnóstico de su catálogo', async () => {
    const r = await m.cargar(libro({ ausentismos: [fila(2, { ...AUSENTISMO, numeroDocumento: 'INC-1', observaciones: 'Reposo' })] }));
    expect(r.errores).toEqual([]);
    expect(r.resumen.ausentismos).toBe(1);
    expect(m.servicios.ausentismo.registrarEnTx).toHaveBeenCalledWith(
      m.db,
      expect.objectContaining({ trabajadorId: TRABAJADOR_ID, tipoId: TIPO_GENERAL, fechaInicio: '2026-03-10', fechaFin: '2026-03-14', diagnosticoId: DIAGNOSTICO_ID, numeroDocumento: 'INC-1', observaciones: 'Reposo', esProrroga: undefined }),
      USUARIO,
    );
  });

  it('el tipo se reconoce por su nombre o por su código, sin importar mayúsculas ni tildes', async () => {
    await m.cargar(libro({ ausentismos: [fila(2, { ...AUSENTISMO, tipo: 'ENFERMEDAD GENERAL' }), fila(3, { ...AUSENTISMO, tipo: 'luto', cie10: undefined as never, fechaInicio: '20/03/2026', fechaFin: '21/03/2026' })] }));
    expect(m.servicios.ausentismo.registrarEnTx.mock.calls.map((c: unknown[]) => (c[1] as { tipoId: string }).tipoId)).toEqual([TIPO_GENERAL, TIPO_LUTO]);
  });

  it('una prórroga lleva los días previos al servicio', async () => {
    await m.cargar(libro({ ausentismos: [fila(2, { ...AUSENTISMO, prorroga: 'Sí', diasPrevios: 30 })] }));
    expect(m.servicios.ausentismo.registrarEnTx).toHaveBeenCalledWith(m.db, expect.objectContaining({ esProrroga: true, diasPrevios: 30 }), USUARIO);
  });

  it('un trabajador que no está ni en el sistema ni en la hoja es un error claro', async () => {
    m.db.trabajador.findUnique.mockResolvedValue(null);
    const r = await m.cargar(libro({ ausentismos: [fila(2, AUSENTISMO)] }));
    expect(r.errores).toEqual([expect.objectContaining({ hoja: 'Ausentismos', fila: 2, columna: 'Documento del trabajador', mensaje: expect.stringMatching(/No existe un trabajador con el documento 1000000001.*hoja Trabajadores/) })]);
    expect(m.servicios.ausentismo.registrarEnTx).not.toHaveBeenCalled();
  });

  it('un tipo que no existe dice cuáles son los tipos', async () => {
    const r = await m.cargar(libro({ ausentismos: [fila(2, { ...AUSENTISMO, tipo: 'Vacaciones' })] }));
    expect(r.errores[0].mensaje).toBe('No existe el tipo de ausentismo "Vacaciones". Los tipos son: Enfermedad general, Licencia por luto');
  });

  it('un código CIE-10 que no está en el catálogo dice dónde agregarlo', async () => {
    const r = await m.cargar(libro({ ausentismos: [fila(2, { ...AUSENTISMO, cie10: 'Z99.9' })] }));
    expect(r.errores).toEqual([expect.objectContaining({ columna: 'Código CIE-10', mensaje: expect.stringMatching(/Z99\.9.*Configuración → Seguridad social/) })]);
  });

  it('lo que el servicio rechaza (traslape, parámetros del año…) queda como error de esa fila', async () => {
    m.servicios.ausentismo.registrarEnTx.mockRejectedValueOnce(new NotFoundException('No hay parámetros legales del año 2025: créalos en Configuración → Seguridad social'));
    const r = await m.cargar(libro({ ausentismos: [fila(2, { ...AUSENTISMO, fechaInicio: '10/03/2025', fechaFin: '12/03/2025' })] }));
    expect(r.errores).toEqual([expect.objectContaining({ hoja: 'Ausentismos', fila: 2, mensaje: 'No hay parámetros legales del año 2025: créalos en Configuración → Seguridad social' })]);
    expect(r.resumen.ausentismos).toBe(0);
  });

  it('un ausentismo de un trabajador de la misma carga usa el trabajador recién creado', async () => {
    m.db.trabajador.findUnique.mockResolvedValue(null);
    const r = await m.cargar(libro({ trabajadores: [fila(2, TRABAJADOR_NUEVO)], ausentismos: [fila(2, AUSENTISMO)] }));
    expect(r.errores).toEqual([]);
    expect(m.servicios.ausentismo.registrarEnTx).toHaveBeenCalledWith(m.db, expect.objectContaining({ trabajadorId: TRABAJADOR_ID }), USUARIO);
  });
});

describe('cargarLibroSst: entregas de EPP y asistencias', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
    m.db.trabajador.findUnique.mockResolvedValue({ id: TRABAJADOR_ID, nombre: 'Persona Inventada' });
  });

  it('registra la entrega con el elemento de su catálogo y la fecha de hoy como referencia', async () => {
    const r = await m.cargar(libro({ entregasEpp: [fila(2, { ...ENTREGA, tallaReferencia: 'M', firmo: 'Sí' })] }));
    expect(r.errores).toEqual([]);
    expect(r.resumen.entregasEpp).toBe(1);
    expect(m.servicios.epp.registrarEntregaEnTx).toHaveBeenCalledWith(
      m.db,
      expect.objectContaining({ trabajadorId: TRABAJADOR_ID, elementoId: ELEMENTO_CASCO, fecha: '2026-03-05', cantidad: 1, tallaReferencia: 'M', motivo: 'DOTACION_INICIAL', firmoRecibido: true }),
      USUARIO,
      HOY,
    );
  });

  it('un elemento que no está en el catálogo dice dónde crearlo', async () => {
    const r = await m.cargar(libro({ entregasEpp: [fila(2, { ...ENTREGA, elemento: 'Arnés' })] }));
    expect(r.errores).toEqual([expect.objectContaining({ hoja: 'Entregas EPP', columna: 'Elemento', mensaje: expect.stringMatching(/"Arnés".*catálogo de EPP/) })]);
  });

  it('registra la asistencia en la capacitación que coincide por tema y fecha', async () => {
    const r = await m.cargar(libro({ asistencias: [fila(2, { ...ASISTENCIA, firmo: 'Sí', calificacion: '4,5' })] }));
    expect(r.errores).toEqual([]);
    expect(r.resumen.asistencias).toEqual({ registradas: 1, yaRegistradas: 0 });
    expect(m.servicios.capacitaciones.registrarAsistentesEnTx).toHaveBeenCalledWith(m.db, CAPACITACION_ID, { asistentes: [{ trabajadorId: TRABAJADOR_ID, firmo: true, calificacion: 4.5 }] }, USUARIO);
  });

  it('una capacitación que no existe, o que hay varias iguales, es un error', async () => {
    m.db.capacitacion.findMany.mockResolvedValueOnce([]);
    const sinCapacitacion = await m.cargar(libro({ asistencias: [fila(2, ASISTENCIA)] }));
    expect(sinCapacitacion.errores[0].mensaje).toMatch(/No existe una capacitación "Trabajo seguro en alturas" programada el 10\/04\/2026/);

    const dos = montar();
    dos.db.trabajador.findUnique.mockResolvedValue({ id: TRABAJADOR_ID, nombre: 'Persona Inventada' });
    dos.db.capacitacion.findMany.mockResolvedValue([
      { id: ID(31), tema: 'Trabajo seguro en alturas' },
      { id: ID(32), tema: 'Trabajo Seguro En Alturas' },
    ]);
    const repetida = await dos.cargar(libro({ asistencias: [fila(2, ASISTENCIA)] }));
    expect(repetida.errores[0].mensaje).toMatch(/2 capacitaciones con ese tema en esa fecha/);
  });

  it('una asistencia que ya estaba registrada no se duplica y se avisa', async () => {
    m.servicios.capacitaciones.registrarAsistentesEnTx.mockResolvedValueOnce({ registrados: 0, omitidos: 1 });
    const r = await m.cargar(libro({ asistencias: [fila(2, ASISTENCIA)] }));
    expect(r.errores).toEqual([]);
    expect(r.resumen.asistencias).toEqual({ registradas: 0, yaRegistradas: 1 });
    expect(r.avisos[0].mensaje).toMatch(/ya estaba registrado/);
  });
});

describe('cargarLibroSst: el archivo en conjunto', () => {
  it('procesa en orden: trabajadores, ausentismos, entregas y asistencias', async () => {
    const m = montar();
    m.db.trabajador.findUnique.mockResolvedValue(null);
    await m.cargar(
      libro({
        asistencias: [fila(2, ASISTENCIA)],
        entregasEpp: [fila(2, ENTREGA)],
        ausentismos: [fila(2, AUSENTISMO)],
        trabajadores: [fila(2, TRABAJADOR_NUEVO)],
      }),
    );
    expect(m.orden.filter((paso) => !paso.includes('SAVEPOINT'))).toEqual(['crear trabajador', 'registrar ausentismo', 'registrar entrega', 'registrar asistencia']);
  });

  it('cuenta las filas que leyó de cada hoja', async () => {
    const m = montar();
    const r = await m.cargar(libro({ trabajadores: [fila(2, TRABAJADOR_NUEVO), fila(3, { ...TRABAJADOR_NUEVO, documento: '1000000002' })] }));
    expect(r.resumen.filas).toEqual({ trabajadores: 2, ausentismos: 0, entregasEpp: 0, asistencias: 0 });
  });

  it('un archivo sin ninguna fila con datos es un error, no una carga vacía', async () => {
    const r = await montar().cargar(libro({}));
    expect(r.errores).toEqual([{ hoja: 'Archivo', fila: null, mensaje: 'El archivo no tiene filas con datos para cargar' }]);
  });

  it('los problemas de lectura del libro (columnas que faltan) cuentan como errores', async () => {
    const r = await montar().cargar(libro({ trabajadores: [fila(2, TRABAJADOR_NUEVO)] }, [{ hoja: 'Ausentismos', fila: 1, columna: 'Fecha de inicio', mensaje: 'Falta la columna "Fecha de inicio"' }]));
    expect(r.errores).toEqual([expect.objectContaining({ hoja: 'Ausentismos', mensaje: 'Falta la columna "Fecha de inicio"' })]);
  });
});
