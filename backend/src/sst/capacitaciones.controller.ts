import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CapacitacionesService } from './capacitaciones.service.js';
import { DocumentosSstService } from './documentos-sst.service.js';
import {
  ActualizarAsistenciaDto,
  ActualizarCapacitacionDto,
  AnularAsistenciaDto,
  CrearCapacitacionDto,
  ListarCapacitacionesQueryDto,
  RegistrarAsistentesDto,
} from './dto/capacitaciones.dto.js';

const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

// Plan de capacitación y su asistencia. Ver: sst.ver. Crear, editar y registrar asistencia: sst.gestionar. Son datos de la
// empresa, no de un proyecto: no es para usuarios con alcance restringido.
@SoloAlcanceTotal()
@Controller('sst/capacitaciones')
export class CapacitacionesController {
  constructor(
    private readonly capacitacionesService: CapacitacionesService,
    private readonly documentosService: DocumentosSstService,
  ) {}

  @Permiso(PERMISOS.SST_VER)
  @Get()
  listar(@Query() filtro: ListarCapacitacionesQueryDto) {
    return this.capacitacionesService.listar(filtro);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post()
  crear(@Body() dto: CrearCapacitacionDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.capacitacionesService.crear(dto, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.capacitacionesService.buscar(id);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCapacitacionDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.capacitacionesService.actualizar(id, dto, usuario);
  }

  // ---------- Asistencia (RF-SST-19) ----------

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post(':id/asistencias')
  registrarAsistentes(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegistrarAsistentesDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.capacitacionesService.registrarAsistentes(id, dto, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Patch(':id/asistencias/:asistenciaId')
  actualizarAsistencia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('asistenciaId', ParseUUIDPipe) asistenciaId: string,
    @Body() dto: ActualizarAsistenciaDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.capacitacionesService.actualizarAsistencia(id, asistenciaId, dto, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post(':id/asistencias/:asistenciaId/anular')
  anularAsistencia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('asistenciaId', ParseUUIDPipe) asistenciaId: string,
    @Body() dto: AnularAsistenciaDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.capacitacionesService.anularAsistencia(id, asistenciaId, dto, usuario);
  }

  // ---------- Listados de asistencia y evidencias (RF-SST-21) ----------

  @Permiso(PERMISOS.SST_VER)
  @Get(':id/documentos')
  listarDocumentos(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentosService.listar({ tipo: 'capacitacion', id });
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post(':id/documentos')
  @UseInterceptors(FileInterceptor('documento', { limits: { fileSize: TAMANO_MAXIMO_DOCUMENTO } }))
  subirDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body('descripcion') descripcion: string | undefined,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.documentosService.subir({ tipo: 'capacitacion', id }, archivo, typeof descripcion === 'string' ? descripcion : undefined, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get(':id/documentos/:documentoId')
  async descargarDocumento(@Param('id', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) documentoId: string, @Res() res: Response) {
    const { buffer, contentType, nombre } = await this.documentosService.leer({ tipo: 'capacitacion', id }, documentoId);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  }
}
