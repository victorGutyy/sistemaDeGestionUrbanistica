import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';

// Usuario de pruebas. Sin argumento ve todos los proyectos; con una lista de ids
// queda restringido a esos proyectos.
export function usuarioDePrueba(proyectoIds: string[] | null = null): UsuarioAutenticado {
  return {
    id: 'usuario-prueba',
    email: 'prueba@ejemplo.test',
    nombre: 'Usuario de prueba',
    rol: { id: 'rol-prueba', clave: 'PRUEBA', nombre: 'Prueba' },
    permisos: [],
    proyectoIds,
  };
}
