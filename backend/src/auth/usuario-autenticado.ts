// Lo que queda en request.user tras pasar por JwtStrategy. Se arma en cada
// petición con datos frescos de la base: si el gerente cambia el rol o
// desactiva a alguien, el cambio aplica de inmediato.
export interface UsuarioAutenticado {
  id: string;
  email: string;
  nombre: string;
  rol: { id: string; clave: string; nombre: string };
  permisos: string[];
}
