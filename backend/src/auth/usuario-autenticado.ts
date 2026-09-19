import { Rol } from '../generated/prisma/enums.js';

// Forma del payload del JWT, y de lo que queda en request.user tras
// pasar por JwtStrategy.
export interface UsuarioAutenticado {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
}
