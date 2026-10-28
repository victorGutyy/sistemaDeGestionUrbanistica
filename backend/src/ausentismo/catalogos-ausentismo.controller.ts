import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CatalogosAusentismoService } from './catalogos-ausentismo.service.js';
import {
  ActualizarDiagnosticoCie10Dto,
  ActualizarTipoAusentismoDto,
  CrearDiagnosticoCie10Dto,
  CrearTipoAusentismoDto,
  ListarDiagnosticosCie10QueryDto,
  ListarTiposAusentismoQueryDto,
} from './dto/catalogos.dto.js';

// Catálogos del ausentismo. Leerlos: sst.ver (el formulario los necesita para elegir tipo y diagnóstico). Los tipos, con su
// regla y porcentaje, son reglas de liquidación: solo los edita quien administra la configuración (el gerente). Los
// diagnósticos CIE-10 los agrega y desactiva quien gestiona el módulo SST (decisión del 28/10/2026). Son datos de la
// empresa, no de un proyecto: no es para usuarios con alcance restringido.
@SoloAlcanceTotal()
@Controller('sst/ausentismo')
export class CatalogosAusentismoController {
  constructor(private readonly catalogos: CatalogosAusentismoService) {}

  @Permiso(PERMISOS.SST_VER)
  @Get('tipos')
  listarTipos(@Query() filtro: ListarTiposAusentismoQueryDto) {
    return this.catalogos.listarTipos(filtro.incluirInactivos === 'true');
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('tipos')
  crearTipo(@Body() dto: CrearTipoAusentismoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.catalogos.crearTipo(dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('tipos/:id')
  actualizarTipo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarTipoAusentismoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.catalogos.actualizarTipo(id, dto, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get('diagnosticos')
  listarDiagnosticos(@Query() filtro: ListarDiagnosticosCie10QueryDto) {
    return this.catalogos.listarDiagnosticos(filtro);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post('diagnosticos')
  crearDiagnostico(@Body() dto: CrearDiagnosticoCie10Dto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.catalogos.crearDiagnostico(dto, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Patch('diagnosticos/:id')
  actualizarDiagnostico(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarDiagnosticoCie10Dto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.catalogos.actualizarDiagnostico(id, dto, usuario);
  }
}
