import { describe, expect, it } from 'vitest';
import { CLAVE_CONTRATISTA_SST, CLAVE_GERENTE, ROLES_SISTEMA } from '../auth/permisos.js';
import { presentarAusentismo, vistaDe } from './visibilidad.js';

const permisosDe = (clave: string) => ROLES_SISTEMA.find((rol) => rol.clave === clave)?.permisos ?? [];

// Un ausentismo con todo lo delicado, para comprobar qué sale por rol.
const REGISTRO = {
  id: 'a-1',
  dias: 5,
  numeroDocumento: 'INC-0042',
  cargoFoto: 'Oficial',
  diagnosticoId: 'cie-1',
  diagnostico: { codigo: 'M54.5', descripcion: 'Lumbago no especificado' },
  observaciones: 'Cirugía de columna programada',
  documentos: [{ id: 'doc-1', nombreOriginal: 'certificado.pdf' }],
  _count: { documentos: 1, periodos: 1 },
  salarioFoto: '3000000',
  baseDiaria: '100000',
  pisoDiario: '58363.5',
  parametrosLiquidacion: { smmlv: '1750905' },
  liquidacionCalculada: { totales: { valorEps: '200010' } },
  corregida: true,
  motivoCorreccion: 'La EPS reconoció 210.000',
  periodos: [{ anio: 2026, mes: 3, dias: 5, diasEmpleador: 2, diasEps: 3, valorEmpleador: '133340', valorEps: '200010', valorArl: '0', valorAfp: '0', valorDescuento: '0' }],
  recobros: [{ id: 'r-1', entidad: 'EPS', estado: 'PAGADA', valorReconocido: '210000', observaciones: 'Pagó 210.000', fechaPago: '2026-04-20' }],
  totales: { dias: 5, diasEps: 3, valorEps: '200010', valorEmpleador: '133340' },
};

const SECRETOS_DE_SALUD = ['M54.5', 'Lumbago', 'Cirugía de columna', 'cie-1', 'certificado.pdf'];
const SECRETOS_DE_VALORES = ['3000000', '100000', '58363.5', '1750905', '200010', '133340', '210000', '210.000'];

const texto = (objeto: unknown) => JSON.stringify(objeto);

describe('vistaDe: qué permisos tiene cada rol del sistema (RF-USR-11)', () => {
  it('el gerente ve diagnósticos y valores', () => {
    expect(vistaDe({ permisos: permisosDe(CLAVE_GERENTE) })).toEqual({ verDiagnosticos: true, verValores: true });
  });

  it('el administrador ve valores pero no diagnósticos', () => {
    expect(vistaDe({ permisos: permisosDe('ADMINISTRADOR') })).toEqual({ verDiagnosticos: false, verValores: true });
  });

  it('el contratista SST ve diagnósticos pero no valores', () => {
    expect(vistaDe({ permisos: permisosDe(CLAVE_CONTRATISTA_SST) })).toEqual({ verDiagnosticos: true, verValores: false });
  });

  it('consulta no ve ninguno de los dos', () => {
    expect(vistaDe({ permisos: permisosDe('CONSULTA') })).toEqual({ verDiagnosticos: false, verValores: false });
  });
});

describe('presentarAusentismo (RNF-SEG-08)', () => {
  it('con los dos permisos entrega todo', () => {
    const resultado = presentarAusentismo(REGISTRO, { verDiagnosticos: true, verValores: true });
    expect(resultado).toEqual(REGISTRO);
  });

  it('sin diagnósticos (administrador) no sale ningún dato de salud, ni el conteo de certificados', () => {
    const resultado = presentarAusentismo(REGISTRO, vistaDe({ permisos: permisosDe('ADMINISTRADOR') }));
    for (const secreto of SECRETOS_DE_SALUD) {
      expect(texto(resultado), secreto).not.toContain(secreto);
    }
    expect(resultado._count).toEqual({ periodos: 1 });
    // Pero sí ve lo demás: el tipo de documento, los días y los valores.
    expect(resultado).toMatchObject({ numeroDocumento: 'INC-0042', dias: 5, salarioFoto: '3000000', baseDiaria: '100000' });
  });

  it('sin valores (contratista) no sale ningún valor: ni salario, ni valor diario, ni lo que paga cada entidad, ni los recobros', () => {
    const resultado = presentarAusentismo(REGISTRO, vistaDe({ permisos: permisosDe(CLAVE_CONTRATISTA_SST) }));
    for (const secreto of SECRETOS_DE_VALORES) {
      expect(texto(resultado), secreto).not.toContain(secreto);
    }
    // Sí ve los días de cada pagador, el estado del recobro y los datos de salud.
    expect(resultado.periodos).toEqual([{ anio: 2026, mes: 3, dias: 5, diasEmpleador: 2, diasEps: 3 }]);
    expect(resultado.recobros).toEqual([{ id: 'r-1', entidad: 'EPS', estado: 'PAGADA', fechaPago: '2026-04-20' }]);
    expect(resultado.totales).toEqual({ dias: 5, diasEps: 3 });
    expect(resultado).toMatchObject({ diagnostico: { codigo: 'M54.5' }, observaciones: 'Cirugía de columna programada', corregida: true });
  });

  it('sin ninguno de los dos permisos solo queda lo básico', () => {
    const resultado = presentarAusentismo(REGISTRO, vistaDe({ permisos: permisosDe('CONSULTA') }));
    for (const secreto of [...SECRETOS_DE_SALUD, ...SECRETOS_DE_VALORES]) {
      expect(texto(resultado), secreto).not.toContain(secreto);
    }
    expect(resultado).toMatchObject({ id: 'a-1', dias: 5, numeroDocumento: 'INC-0042', cargoFoto: 'Oficial' });
  });

  it('no modifica el objeto original', () => {
    const copia = structuredClone(REGISTRO);
    presentarAusentismo(REGISTRO, { verDiagnosticos: false, verValores: false });
    expect(REGISTRO).toEqual(copia);
  });

  it('un registro sin relaciones (una fila de lista) también se filtra', () => {
    const resultado = presentarAusentismo({ id: 'a-2', salarioFoto: '1', diagnosticoId: 'x' }, { verDiagnosticos: false, verValores: false });
    expect(resultado).toEqual({ id: 'a-2' });
  });
});

describe('presentarRecobro y presentarResumen', () => {
  const RECOBRO = { id: 'r-1', entidad: 'EPS', estado: 'PAGADA', valorEsperado: '200010', valorReconocido: '210000', observaciones: 'Pagó 210.000', fechaPago: '2026-04-20' };

  it('el recobro sin valores deja solo el estado y las fechas', async () => {
    const { presentarRecobro } = await import('./visibilidad.js');
    const sinValores = presentarRecobro(RECOBRO, vistaDe({ permisos: permisosDe(CLAVE_CONTRATISTA_SST) }));
    expect(sinValores).toEqual({ id: 'r-1', entidad: 'EPS', estado: 'PAGADA', fechaPago: '2026-04-20' });
    expect(presentarRecobro(RECOBRO, vistaDe({ permisos: permisosDe('ADMINISTRADOR') }))).toEqual(RECOBRO);
  });

  it('el resumen sin valores conserva los días y quita los valores de cada mes y del total', async () => {
    const { presentarResumen } = await import('./visibilidad.js');
    const resumen = {
      anio: 2026,
      meses: [{ mes: 3, dias: 5, valores: { eps: '200010' } }],
      total: { dias: 5, valores: { eps: '200010' } },
    };
    const sinValores = presentarResumen(resumen, vistaDe({ permisos: permisosDe(CLAVE_CONTRATISTA_SST) }));
    expect(sinValores).toEqual({ anio: 2026, meses: [{ mes: 3, dias: 5 }], total: { dias: 5 } });
    expect(presentarResumen(resumen, vistaDe({ permisos: permisosDe(CLAVE_GERENTE) }))).toEqual(resumen);
  });
});
