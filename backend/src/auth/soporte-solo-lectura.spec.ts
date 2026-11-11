import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLAVE_SOPORTE_TECNICO, esPermisoValido, PERMISOS, ROLES_SISTEMA } from './permisos.js';

// Red de seguridad del rol "Soporte técnico": es de SOLO LECTURA. Estas pruebas leen el código fuente de los controladores
// y fallan si una ruta que cambia datos (POST, PATCH, PUT, DELETE) quedara abierta a quien tenga solo los permisos del rol.
// Un permiso nuevo no entra al rol solo (la lista es explícita), pero una ruta nueva sí podría quedar protegida por un
// permiso de "ver" por descuido: eso es lo que atrapa la segunda prueba.

const RAIZ_SRC = join(__dirname, '..');

function controladores(directorio: string): string[] {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) {
      return nombre === 'generated' || nombre === 'node_modules' ? [] : controladores(ruta);
    }
    return ruta.endsWith('.controller.ts') ? [ruta] : [];
  });
}

const soporte = ROLES_SISTEMA.find((rol) => rol.clave === CLAVE_SOPORTE_TECNICO);
const PERMISOS_DEL_SOPORTE: string[] = soporte?.permisos ?? [];

// Valor de un permiso (p. ej. PERMISOS.NOMINA_VER -> 'nomina.ver').
const valorDe = (nombre: string): string | undefined => (PERMISOS as Record<string, string>)[nombre];

const permisosEn = (texto: string): string[] => [...texto.matchAll(/PERMISOS\.(\w+)/g)].map((m) => valorDe(m[1])).filter((v): v is string => Boolean(v));

describe('rol Soporte técnico', () => {
  it('existe, con permisos válidos y sin límite por proyecto', () => {
    expect(soporte).toBeDefined();
    expect(soporte?.limitablePorProyecto).toBe(false);
    for (const permiso of PERMISOS_DEL_SOPORTE) expect(esPermisoValido(permiso), permiso).toBe(true);
  });

  it('solo tiene permisos de lectura: nada de acciones, usuarios ni diagnósticos de salud', () => {
    // Todos terminan en ".ver", salvo el de valores liquidados del ausentismo, que es de lectura.
    const permitidasDeLectura = new Set<string>([PERMISOS.SST_VALORES_VER]);
    for (const permiso of PERMISOS_DEL_SOPORTE) {
      expect(permiso.endsWith('.ver') || permitidasDeLectura.has(permiso), permiso).toBe(true);
    }
    expect(PERMISOS_DEL_SOPORTE).not.toContain(PERMISOS.USUARIOS_GESTIONAR);
    expect(PERMISOS_DEL_SOPORTE).not.toContain(PERMISOS.SST_DIAGNOSTICOS_VER);
    expect(PERMISOS_DEL_SOPORTE).not.toContain(PERMISOS.SST_GESTIONAR);
    expect(PERMISOS_DEL_SOPORTE).not.toContain(PERMISOS.EXPORTACION_COMPLETA);
    expect(PERMISOS_DEL_SOPORTE).not.toContain(PERMISOS.IMPORTACION_GESTIONAR);
    expect(PERMISOS_DEL_SOPORTE).not.toContain(PERMISOS.CONFIGURACION_EDITAR);
  });

  it('puede ver todos los módulos de consulta', () => {
    for (const permiso of [PERMISOS.NOMINA_VER, PERMISOS.SST_VER, PERMISOS.AUDITORIA_VER, PERMISOS.CONFIGURACION_VER, PERMISOS.REPORTES_VER, PERMISOS.COMISIONES_VER]) {
      expect(PERMISOS_DEL_SOPORTE).toContain(permiso);
    }
  });

  it('ninguna ruta que cambia datos queda abierta con solo sus permisos', () => {
    const abiertas: string[] = [];
    let rutasDeEscritura = 0;

    for (const ruta of controladores(RAIZ_SRC)) {
      const lineas = readFileSync(ruta, 'utf8').split(/\r?\n/);
      const inicioClase = lineas.findIndex((l) => l.startsWith('export class '));
      // Decoradores de la clase: los que están justo antes de "export class", pegados.
      let desde = inicioClase;
      while (desde > 0 && /^\s*(@|\/\/)/.test(lineas[desde - 1])) desde--;
      const decoradoresDeClase = lineas.slice(desde, inicioClase).join('\n');
      const permisosDeClase = permisosEn(decoradoresDeClase);
      const claseAbierta = /@Public\(|@SoloSesion\(/.test(decoradoresDeClase);

      lineas.forEach((linea, i) => {
        if (!/@(Post|Patch|Put|Delete)\(/.test(linea)) return;
        rutasDeEscritura++;
        // Decoradores del método: los contiguos antes de la ruta y los que siguen hasta la firma.
        const bloque: string[] = [];
        for (let j = i - 1; j >= 0 && /^\s*(@|\/\/)/.test(lineas[j]); j--) bloque.push(lineas[j]);
        for (let j = i; j < lineas.length; j++) {
          bloque.push(lineas[j]);
          if (/^\s*(async\s+)?\w+\(/.test(lineas[j])) break;
        }
        const texto = bloque.join('\n');
        // Rutas sin permiso de datos: iniciar sesión, recuperar contraseña, etc.
        if (claseAbierta || /@Public\(|@SoloSesion\(/.test(texto)) return;

        // El servidor exige TODOS los permisos declarados en el método. Si la ruta no declara ninguno, hereda los de la clase.
        // Sin ningún permiso declarado queda abierta (every de una lista vacía es verdadero) y la prueba lo reporta.
        const requeridos = permisosEn(texto).length > 0 ? permisosEn(texto) : permisosDeClase;
        const quedaAbierta = requeridos.every((p) => PERMISOS_DEL_SOPORTE.includes(p));
        if (quedaAbierta) abiertas.push(`${relative(RAIZ_SRC, ruta).replace(/\\/g, '/')}:${i + 1} (${linea.trim()}) exige: ${requeridos.join(', ') || 'nada'}`);
      });
    }

    expect(rutasDeEscritura, 'la prueba debe encontrar rutas de escritura').toBeGreaterThan(50);
    expect(abiertas).toEqual([]);
  });
});
