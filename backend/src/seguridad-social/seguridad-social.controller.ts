import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import {
  ActualizarClaseRiesgoArlDto,
  ActualizarEntidadSSDto,
  ActualizarParametroLegalDto,
  CrearEntidadSSDto,
  CrearParametroLegalDto,
} from './dto/seguridad-social.dto.js';
import { SeguridadSocialService } from './seguridad-social.service.js';

// Leer los catálogos: cualquiera que use el módulo SST (los necesita para elegir entidades al afiliar).
// Escribirlos: solo configuracion.editar (el gerente), igual que el resto de catálogos de la empresa.
// Son datos de la empresa, no de un proyecto: no es para usuarios con alcance restringido.
@SoloAlcanceTotal()
@Controller('seguridad-social')
export class SeguridadSocialController {
  constructor(private readonly seguridadSocialService: SeguridadSocialService) {}

  @Permiso(PERMISOS.SST_VER)
  @Get('catalogos')
  catalogos() {
    return this.seguridadSocialService.listarCatalogos();
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('parametros-legales')
  crearParametro(@Body() dto: CrearParametroLegalDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.seguridadSocialService.crearParametro(dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('parametros-legales/:id')
  actualizarParametro(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarParametroLegalDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.seguridadSocialService.actualizarParametro(id, dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('parametros-legales/:id/validar')
  validarParametro(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.seguridadSocialService.validarParametro(id, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('entidades')
  crearEntidad(@Body() dto: CrearEntidadSSDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.seguridadSocialService.crearEntidad(dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('entidades/:id')
  actualizarEntidad(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarEntidadSSDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.seguridadSocialService.actualizarEntidad(id, dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('clases-riesgo/:id')
  actualizarClaseRiesgo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarClaseRiesgoArlDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.seguridadSocialService.actualizarClaseRiesgo(id, dto, usuario);
  }
}
