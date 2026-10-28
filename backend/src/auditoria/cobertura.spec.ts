import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from './auditoria.js';

// Red de seguridad de la auditoría (RF-AUD-01): estas pruebas leen el código fuente y fallan si alguien agrega una
// escritura a la base de datos sin auditarla, o deja una acción del catálogo sin usar.

const RAIZ_SRC = join(__dirname, '..');

function archivosFuente(directorio: string): string[] {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) {
      return nombre === 'generated' || nombre === 'node_modules' ? [] : archivosFuente(ruta);
    }
    return ruta.endsWith('.ts') && !ruta.endsWith('.spec.ts') ? [ruta] : [];
  });
}

const FUENTES = archivosFuente(RAIZ_SRC).map((ruta) => ({ ruta: relative(RAIZ_SRC, ruta).replace(/\\/g, '/'), texto: readFileSync(ruta, 'utf8') }));

// Escrituras de datos de negocio. Las lecturas (find, count, aggregate) no cuentan.
// Se exige "algo.modelo.accion(" (p. ej. tx.abono.create) para no confundir con NestFactory.create y similares.
const ESCRITURA = /\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

// Archivos que escriben en la base de datos y NO se auditan, cada uno con su razón.
const EXENTOS: Record<string, string> = {
  'auth/auth.service.ts': 'Sesiones: último ingreso, intentos fallidos y bloqueos de seguridad; no son cambios de datos de negocio.',
  'recordatorios/recordatorios.service.ts': 'Proceso automático del sistema (cron), sin una persona que actúe.',
  'notificaciones/notificaciones.service.ts': 'Es el historial de avisos a clientes: cada intento se inserta y no se modifica (la base lo impide); no cambia datos de negocio ni dinero.',
  'roles/roles.service.ts': 'Sincroniza los roles del sistema al arrancar la aplicación, sin una persona que actúe.',
  'lotes/separacion.ts': 'Convierte la separación al vender: queda cubierta por el registro de la venta y el cambio de estado del lote.',
  'abonos/recibos-historicos.ts': 'Recibos históricos de abonos anteriores al sistema: los emite el seed, sin una persona que actúe.',
  'sst/avisos-sst.service.ts': 'Proceso automático del sistema (cron) y su historial de avisos, que solo se inserta (la base lo impide editar); no cambia datos de negocio ni dinero, solo marca qué aviso ya salió.',
  'auditoria/auditoria.ts': 'Es el propio registro de auditoría.',
  'prisma/prisma.service.ts': 'Conexión a la base de datos.',
};

describe('cobertura de la auditoría', () => {
  const conEscritura = FUENTES.filter((f) => ESCRITURA.test(f.texto));

  it('el análisis encuentra los servicios que escriben datos (si no, esta prueba no sirve)', () => {
    expect(conEscritura.length).toBeGreaterThan(10);
  });

  it('todo archivo que escribe en la base de datos audita sus acciones o está en la lista de exentos con su razón', () => {
    const sinAuditar = conEscritura
      .filter((f) => !f.texto.includes('registrarAuditoria'))
      .map((f) => f.ruta)
      .filter((ruta) => !(ruta in EXENTOS));
    expect(sinAuditar, `Estos archivos escriben datos sin auditar: ${sinAuditar.join(', ')}`).toEqual([]);
  });

  it('la lista de exentos no tiene archivos que ya no existen o que sí audita', () => {
    for (const ruta of Object.keys(EXENTOS)) {
      const archivo = FUENTES.find((f) => f.ruta === ruta);
      expect(archivo, `${ruta} ya no existe: quitarlo de EXENTOS`).toBeDefined();
    }
  });

  it('cada acción del catálogo se usa en algún servicio (no quedan códigos muertos)', () => {
    const codigo = FUENTES.filter((f) => f.ruta !== 'auditoria/auditoria.ts').map((f) => f.texto).join('\n');
    const sinUso = Object.keys(ACCIONES_AUDITORIA).filter((accion) => !codigo.includes(`'${accion}'`));
    expect(sinUso, `Acciones del catálogo que ningún servicio registra: ${sinUso.join(', ')}`).toEqual([]);
  });

  it('cada tipo de registro del catálogo se usa en algún servicio', () => {
    const codigo = FUENTES.filter((f) => f.ruta !== 'auditoria/auditoria.ts').map((f) => f.texto).join('\n');
    const sinUso = Object.keys(ENTIDADES_AUDITORIA).filter((entidad) => !codigo.includes(`'${entidad}'`));
    expect(sinUso, `Tipos de registro que nadie usa: ${sinUso.join(', ')}`).toEqual([]);
  });
});
