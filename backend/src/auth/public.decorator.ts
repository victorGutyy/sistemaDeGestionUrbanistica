import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca una ruta como accesible sin JWT (el ingreso y la recuperación de contraseña).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
