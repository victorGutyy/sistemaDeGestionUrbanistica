import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CrearVentaDto, RechazarVentaDto } from './dto/crear-venta.dto.js';
import { DesistirVentaDto } from './dto/desistir-venta.dto.js';
import { ListarVentasQueryDto } from './dto/listar-ventas-query.dto.js';
import { VentasService } from './ventas.service.js';

const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;
const MAXIMO_ARCHIVOS_POR_CARGA = 10;

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Permiso(PERMISOS.VENTAS_CREAR)
  @Post()
  crear(@Body() dto: CrearVentaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.crear(dto, usuario);
  }

  // Valores por defecto del negocio para la pantalla de venta nueva.
  @Permiso(PERMISOS.VENTAS_CREAR)
  @Get('parametros')
  parametros(@CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.parametros(usuario);
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get('vendedores')
  vendedores() {
    return this.ventasService.listarVendedores();
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get()
  listar(@Query() filtro: ListarVentasQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.listar(usuario, filtro.estado);
  }

  @Permiso(PERMISOS.VENTAS_CREAR)
  @Post(':id/documentos')
  @UseInterceptors(FilesInterceptor('documentos', MAXIMO_ARCHIVOS_POR_CARGA, { limits: { fileSize: TAMANO_MAXIMO_DOCUMENTO } }))
  subirDocumentos(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() archivos: Express.Multer.File[] | undefined,
    @Body('descripcion') descripcion: string | undefined,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    if (descripcion !== undefined && typeof descripcion !== 'string') {
      throw new BadRequestException('La descripción debe ser texto');
    }
    return this.ventasService.subirDocumentos(id, archivos, descripcion, usuario);
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get(':id/documentos/:documentoId')
  async descargarDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @CurrentUsuario() usuario: UsuarioAutenticado,
    @Res() res: Response,
  ) {
    const { buffer, contentType, nombre } = await this.ventasService.leerDocumento(id, documentoId, usuario);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  }

  // El desistimiento es decisión del gerente.
  @Permiso(PERMISOS.VENTAS_DESISTIR)
  @Post(':id/desistir')
  desistir(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DesistirVentaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.desistir(id, dto, usuario);
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get(':id')
  buscarPorId(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.buscarPorId(id, usuario);
  }

  // Aprobar o rechazar una venta con excepción es decisión del gerente.
  @Permiso(PERMISOS.VENTAS_AUTORIZAR)
  @Post(':id/aprobar')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.aprobar(id, usuario);
  }

  @Permiso(PERMISOS.VENTAS_AUTORIZAR)
  @Post(':id/rechazar')
  rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RechazarVentaDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.ventasService.rechazar(id, dto.motivo, usuario);
  }
}
