import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { AusentismoService } from './ausentismo.service.js';
import { ActualizarAusentismoDto, AnularAusentismoDto, CorregirLiquidacionDto, ListarAusentismosQueryDto, RegistrarAusentismoDto } from './dto/ausentismo.dto.js';

const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

// Ausentismo (incapacidades y licencias). Ver y registrar: sst.ver y sst.gestionar. Qué se ve dentro de cada respuesta lo decide
// el servicio con los permisos aparte de los diagnósticos (sst.diagnosticos_ver) y de los valores (sst.valores_ver), no la
// ruta. Corregir la liquidación cambia valores: exige poder verlos y poder gestionar. Los certificados adjuntos traen el
// diagnóstico: se leen con sst.diagnosticos_ver. Son datos de la empresa, no de un proyecto.
@SoloAlcanceTotal()
@Controller('sst/ausentismo')
export class AusentismoController {
  constructor(private readonly ausentismo: AusentismoService) {}

  @Permiso(PERMISOS.SST_VER)
  @Get()
  listar(@Query() filtro: ListarAusentismosQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ausentismo.listar(filtro, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post()
  registrar(@Body() dto: RegistrarAusentismoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ausentismo.registrar(dto, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ausentismo.buscar(id, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarAusentismoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ausentismo.actualizar(id, dto, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post(':id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularAusentismoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ausentismo.anular(id, dto, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR, PERMISOS.SST_VALORES_VER)
  @Post(':id/correccion')
  corregirLiquidacion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CorregirLiquidacionDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ausentismo.corregirLiquidacion(id, dto, usuario);
  }

  // ---------- Certificados adjuntos ----------

  @Permiso(PERMISOS.SST_VER, PERMISOS.SST_DIAGNOSTICOS_VER)
  @Get(':id/documentos')
  listarDocumentos(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ausentismo.listarDocumentos(id, usuario);
  }

  // Adjuntar no deja leer lo adjuntado: quien registra el ausentismo puede subir el certificado aunque no vea diagnósticos.
  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post(':id/documentos')
  @UseInterceptors(FileInterceptor('documento', { limits: { fileSize: TAMANO_MAXIMO_DOCUMENTO } }))
  subirDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body('descripcion') descripcion: string | undefined,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.ausentismo.subirDocumento(id, archivo, typeof descripcion === 'string' ? descripcion : undefined, usuario);
  }

  @Permiso(PERMISOS.SST_VER, PERMISOS.SST_DIAGNOSTICOS_VER)
  @Get(':id/documentos/:documentoId')
  async descargarDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @CurrentUsuario() usuario: UsuarioAutenticado,
    @Res() res: Response,
  ) {
    const { buffer, contentType, nombre } = await this.ausentismo.leerDocumento(id, documentoId, usuario);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  }
}
