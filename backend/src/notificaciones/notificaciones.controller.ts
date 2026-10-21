import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ListarNotificacionesQueryDto, PrepararWhatsAppDto } from './dto/notificaciones.dto.js';
import { NotificacionesService } from './notificaciones.service.js';

// Avisos a clientes: historial (RF-NOT-06), mensaje de WhatsApp listo para abrir (RF-NOT-04) y reenvío del recibo
// por correo (RF-NOT-01). Todo respeta el alcance por proyecto del usuario.
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Permiso(PERMISOS.NOTIFICACIONES_VER)
  @Get()
  listar(@Query() filtro: ListarNotificacionesQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.notificacionesService.listar(filtro, usuario);
  }

  @Permiso(PERMISOS.NOTIFICACIONES_ENVIAR)
  @Post('whatsapp')
  prepararWhatsApp(@Body() dto: PrepararWhatsAppDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.notificacionesService.prepararWhatsApp(dto, usuario);
  }

  @Permiso(PERMISOS.NOTIFICACIONES_ENVIAR)
  @Post('recibos/:abonoId/correo')
  reenviarRecibo(@Param('abonoId', ParseUUIDPipe) abonoId: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.notificacionesService.reenviarRecibo(abonoId, usuario);
  }
}
