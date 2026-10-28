import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { DocumentosSstService } from './documentos-sst.service.js';
import {
  ActualizarElementoEppDto,
  AnularEntregaEppDto,
  CrearElementoEppDto,
  ListarElementosEppQueryDto,
  ListarEntregasEppQueryDto,
  ListarReposicionesQueryDto,
  RegistrarEntregaEppDto,
} from './dto/epp.dto.js';
import { EppService } from './epp.service.js';

const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

// Elementos de protección personal. Ver: sst.ver. Registrar, anular y administrar el catálogo: sst.gestionar (el contratista
// SST lo hace todo). Son datos de la empresa, no de un proyecto: no es para usuarios con alcance restringido.
@SoloAlcanceTotal()
@Controller('sst/epp')
export class EppController {
  constructor(
    private readonly eppService: EppService,
    private readonly documentosService: DocumentosSstService,
  ) {}

  // ---------- Catálogo ----------

  @Permiso(PERMISOS.SST_VER)
  @Get('elementos')
  listarElementos(@Query() filtro: ListarElementosEppQueryDto) {
    return this.eppService.listarElementos(filtro.incluirInactivos === 'true');
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post('elementos')
  crearElemento(@Body() dto: CrearElementoEppDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.eppService.crearElemento(dto, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Patch('elementos/:id')
  actualizarElemento(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarElementoEppDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.eppService.actualizarElemento(id, dto, usuario);
  }

  // ---------- Reposición ----------

  @Permiso(PERMISOS.SST_VER)
  @Get('reposiciones')
  reposiciones(@Query() filtro: ListarReposicionesQueryDto) {
    return this.eppService.reposiciones(filtro);
  }

  // ---------- Entregas ----------

  @Permiso(PERMISOS.SST_VER)
  @Get('entregas')
  listarEntregas(@Query() filtro: ListarEntregasEppQueryDto) {
    return this.eppService.listarEntregas(filtro);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post('entregas')
  registrarEntrega(@Body() dto: RegistrarEntregaEppDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.eppService.registrarEntrega(dto, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get('entregas/:id')
  buscarEntrega(@Param('id', ParseUUIDPipe) id: string) {
    return this.eppService.buscarEntrega(id);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post('entregas/:id/anular')
  anularEntrega(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularEntregaEppDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.eppService.anularEntrega(id, dto, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post('entregas/:id/firma')
  marcarFirma(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.eppService.marcarFirma(id, usuario);
  }

  // ---------- Actas y otros adjuntos de una entrega (RF-SST-21) ----------

  @Permiso(PERMISOS.SST_VER)
  @Get('entregas/:id/documentos')
  listarDocumentos(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentosService.listar({ tipo: 'entregaEpp', id });
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post('entregas/:id/documentos')
  @UseInterceptors(FileInterceptor('documento', { limits: { fileSize: TAMANO_MAXIMO_DOCUMENTO } }))
  subirDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body('descripcion') descripcion: string | undefined,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.documentosService.subir({ tipo: 'entregaEpp', id }, archivo, typeof descripcion === 'string' ? descripcion : undefined, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get('entregas/:id/documentos/:documentoId')
  async descargarDocumento(@Param('id', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) documentoId: string, @Res() res: Response) {
    const { buffer, contentType, nombre } = await this.documentosService.leer({ tipo: 'entregaEpp', id }, documentoId);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  }
}
