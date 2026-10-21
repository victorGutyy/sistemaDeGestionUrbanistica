import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ListarPorVerificarQueryDto, VerificarAbonoDto, VerificarAbonosDto } from './dto/verificacion.dto.js';
import { VerificacionService } from './verificacion.service.js';

// Verificación de abonos contra el extracto bancario (RF-REC-10). Las rutas fijas ("por-verificar", "verificar")
// no chocan con las de "abonos/:id/...".
@Controller('abonos')
export class VerificacionController {
  constructor(private readonly verificacionService: VerificacionService) {}

  @Permiso(PERMISOS.ABONOS_VERIFICAR)
  @Get('por-verificar')
  listar(@Query() filtro: ListarPorVerificarQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.verificacionService.listarPorVerificar(filtro, usuario);
  }

  @Permiso(PERMISOS.ABONOS_VERIFICAR)
  @Post('verificar')
  verificarVarios(@Body() dto: VerificarAbonosDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.verificacionService.verificar(dto.ids, dto.nota, usuario);
  }

  @Permiso(PERMISOS.ABONOS_VERIFICAR)
  @Post(':id/verificar')
  verificarUno(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerificarAbonoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.verificacionService.verificar([id], dto.nota, usuario);
  }
}
