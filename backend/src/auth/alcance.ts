import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

// Alcance por proyecto (RNF-SEG-04).
//
// usuario.proyectoIds === null  -> ve todos los proyectos.
// usuario.proyectoIds = [a, b]  -> SOLO ve esos proyectos y todo lo que cuelga de
//                                  ellos (lotes, ventas, abonos, cartera, finanzas).
//
// Cada servicio que devuelve o toca datos de un proyecto usa estas funciones.
// Un recurso fuera del alcance responde 404 (igual que si no existiera), para no
// revelar que existe. Los datos que no pertenecen a ningún proyecto (nómina,
// configuración, gastos generales) no son visibles para un usuario restringido.

export function tieneAlcanceTotal(usuario: UsuarioAutenticado): boolean {
  return usuario.proyectoIds === null;
}

// where de Prisma para filtrar por el id de proyecto; {} si no hay restricción.
export function filtroProyectoId(usuario: UsuarioAutenticado): { proyectoId?: { in: string[] } } {
  return usuario.proyectoIds === null ? {} : { proyectoId: { in: usuario.proyectoIds } };
}

export function filtroProyecto(usuario: UsuarioAutenticado): Prisma.ProyectoWhereInput {
  return usuario.proyectoIds === null ? {} : { id: { in: usuario.proyectoIds } };
}

export function filtroLote(usuario: UsuarioAutenticado): Prisma.LoteWhereInput {
  return filtroProyectoId(usuario);
}

export function filtroVenta(usuario: UsuarioAutenticado): Prisma.VentaWhereInput {
  return usuario.proyectoIds === null ? {} : { lote: { proyectoId: { in: usuario.proyectoIds } } };
}

// Un cliente es visible si tiene al menos una venta dentro del alcance.
export function filtroCliente(usuario: UsuarioAutenticado): Prisma.ClienteWhereInput {
  return usuario.proyectoIds === null ? {} : { ventas: { some: filtroVenta(usuario) } };
}

export function filtroMovimiento(usuario: UsuarioAutenticado): Prisma.MovimientoFinancieroWhereInput {
  return filtroProyectoId(usuario);
}

export function puedeVerProyecto(usuario: UsuarioAutenticado, proyectoId: string): boolean {
  return usuario.proyectoIds === null || usuario.proyectoIds.includes(proyectoId);
}

export function exigirProyecto(usuario: UsuarioAutenticado, proyectoId: string, mensajeNoExiste: string): void {
  if (!puedeVerProyecto(usuario, proyectoId)) {
    throw new NotFoundException(mensajeNoExiste);
  }
}

// Para acciones que no pertenecen a un proyecto concreto (crear proyectos o
// clientes sueltos, movimientos generales).
export function exigirAlcanceTotal(usuario: UsuarioAutenticado): void {
  if (usuario.proyectoIds !== null) {
    throw new ForbiddenException('Tu acceso está limitado a ciertos proyectos: no puedes hacer esta acción');
  }
}
