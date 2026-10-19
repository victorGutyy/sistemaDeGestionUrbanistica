import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CierresCajaService } from './cierres-caja.service.js';
import { CerrarCierreDto } from './dto/cerrar-cierre.dto.js';
import { CrearCierreDto } from './dto/crear-cierre.dto.js';
import { ProximoCierreQueryDto } from './dto/proximo-cierre-query.dto.js';
import { AprobarCierreDto, DevolverCierreDto } from './dto/resolver-cierre.dto.js';

// La caja es de toda la empresa, no de un proyecto: quien está limitado a ciertos proyectos no entra aquí.
@SoloAlcanceTotal()
@Controller('cierres-caja')
export class CierresCajaController {
  constructor(private readonly cierresCajaService: CierresCajaService) {}

  @Permiso(PERMISOS.CAJA_VER)
  @Get()
  listar() {
    return this.cierresCajaService.listar();
  }

  @Permiso(PERMISOS.CAJA_VER)
  @Get('proximo')
  proximo(@Query() query: ProximoCierreQueryDto) {
    return this.cierresCajaService.proximo(query.tipo);
  }

  @Permiso(PERMISOS.CAJA_VER)
  @Get(':id/pdf')
  async descargarPdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, nombreArchivo } = await this.cierresCajaService.obtenerPdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nombreArchivo}"` });
    res.send(buffer);
  }

  @Permiso(PERMISOS.CAJA_VER)
  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.cierresCajaService.obtener(id);
  }

  @Permiso(PERMISOS.CAJA_CERRAR)
  @Post()
  crear(@Body() dto: CrearCierreDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.cierresCajaService.crear(dto, usuario);
  }

  @Permiso(PERMISOS.CAJA_CERRAR)
  @Post(':id/cerrar')
  cerrar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CerrarCierreDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.cierresCajaService.cerrar(id, dto, usuario);
  }

  @Permiso(PERMISOS.CAJA_APROBAR)
  @Post(':id/aprobar')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AprobarCierreDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.cierresCajaService.aprobar(id, dto, usuario);
  }

  @Permiso(PERMISOS.CAJA_APROBAR)
  @Post(':id/devolver')
  devolver(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DevolverCierreDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.cierresCajaService.devolver(id, dto, usuario);
  }

  @Permiso(PERMISOS.CAJA_CERRAR)
  @Delete(':id')
  descartar(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.cierresCajaService.descartar(id, usuario);
  }
}
