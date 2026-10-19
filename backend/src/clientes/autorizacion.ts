import type { ActorAuditoria } from '../auditoria/auditoria.js';

// Autorización de tratamiento de datos personales (Ley 1581 de 2012, RF-CLI-04): al darla queda la fecha y quién la
// registró; al retirarla se borran ambas (el cambio queda en la auditoría con los valores anteriores).
export function datosDeAutorizacion(autoriza: boolean, usuario: ActorAuditoria) {
  return autoriza
    ? { autorizaDatos: true, fechaAutorizacion: new Date(), autorizacionRegistradaPorId: usuario.id }
    : { autorizaDatos: false, fechaAutorizacion: null, autorizacionRegistradaPorId: null };
}
