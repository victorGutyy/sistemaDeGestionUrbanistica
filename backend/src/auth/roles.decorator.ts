import { SetMetadata } from '@nestjs/common';
import type { Permiso as PermisoDelCatalogo } from './permisos.js';

export const PERMISOS_KEY = 'permisos';
export const SOLO_SESION_KEY = 'soloSesion';
export const ALCANCE_TOTAL_KEY = 'alcanceTotal';

// Exige que el rol del usuario tenga TODOS los permisos indicados. Puede ir en
// un método o en la clase entera (el del método gana).
// Una ruta sin @Permiso, @SoloSesion ni @Public se rechaza para todos:
// olvidar la declaración nunca deja una ruta abierta.
export const Permiso = (...permisos: PermisoDelCatalogo[]) => SetMetadata(PERMISOS_KEY, permisos);

// Ruta con datos que no pertenecen a un proyecto (nómina, configuración, usuarios…):
// un usuario limitado a ciertos proyectos no puede usarla, aunque su rol tenga el permiso.
// Va junto a @Permiso, en el método o en la clase.
export const SoloAlcanceTotal = (activo = true) => SetMetadata(ALCANCE_TOTAL_KEY, activo);

// Ruta que solo pide una sesión válida, sin permiso especial (p. ej. "mi perfil").
export const SoloSesion = () => SetMetadata(SOLO_SESION_KEY, true);
