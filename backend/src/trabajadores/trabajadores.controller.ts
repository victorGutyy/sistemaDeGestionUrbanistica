import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { TipoDocumentoTrabajador } from '../generated/prisma/enums.js';
import { AfiliacionesTrabajadorService } from './afiliaciones-trabajador.service.js';
import { DocumentosTrabajadorService } from './documentos-trabajador.service.js';
import { CerrarAfiliacionDto, RegistrarAfiliacionDto } from './dto/afiliacion.dto.js';
import { ActualizarTrabajadorDto, AutorizacionSaludDto, RetirarTrabajadorDto } from './dto/actualizar-trabajador.dto.js';
import { CrearTrabajadorDto } from './dto/crear-trabajador.dto.js';
import { TrabajadoresService } from './trabajadores.service.js';

const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

// Todo lo del personal es de la empresa, no de un proyecto: no es para usuarios con alcance restringido.
// Dos puertas de entrada: la de nómina (nomina.ver / nomina.gestionar, con salarios) y la del módulo SST (sst.ver /
// sst.gestionar, sin salarios ni pagos), que es la que usa el contratista. Las rutas fijas van antes que ":id".
@SoloAlcanceTotal()
@Controller('trabajadores')
export class TrabajadoresController {
  constructor(
    private readonly trabajadoresService: TrabajadoresService,
    private readonly afiliacionesService: AfiliacionesTrabajadorService,
    private readonly documentosService: DocumentosTrabajadorService,
  ) {}

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Post()
  crear(@Body() dto: CrearTrabajadorDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.trabajadoresService.crear(dto, usuario);
  }

  @Permiso(PERMISOS.NOMINA_VER)
  @Get()
  listar() {
    return this.trabajadoresService.listar();
  }

  @Permiso(PERMISOS.SST_VER)
  @Get('sst')
  listarSst() {
    return this.trabajadoresService.listarSst();
  }

  @Permiso(PERMISOS.SST_VER)
  @Get('alertas-sst')
  alertasSst() {
    return this.trabajadoresService.alertasSst();
  }

  @Permiso(PERMISOS.NOMINA_VER)
  @Get(':id')
  buscarPorId(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.trabajadoresService.buscarPorId(id, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get(':id/ficha-sst')
  fichaSst(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.trabajadoresService.fichaSst(id, usuario);
  }

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarTrabajadorDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.trabajadoresService.actualizar(id, dto, usuario);
  }

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Post(':id/retiro')
  retirar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RetirarTrabajadorDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.trabajadoresService.retirar(id, dto, usuario);
  }

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Post(':id/reactivar')
  reactivar(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.trabajadoresService.reactivar(id, usuario);
  }

  @Permiso(PERMISOS.SST_GESTIONAR)
  @Put(':id/autorizacion-salud')
  autorizacionSalud(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AutorizacionSaludDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.trabajadoresService.registrarAutorizacionSalud(id, dto, usuario);
  }

  // ---------- Afiliaciones (RF-PER-04): las ve el módulo SST, las mantiene quien gestiona el personal ----------

  @Permiso(PERMISOS.SST_VER)
  @Get(':id/afiliaciones')
  listarAfiliaciones(@Param('id', ParseUUIDPipe) id: string) {
    return this.afiliacionesService.listar(id);
  }

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Post(':id/afiliaciones')
  registrarAfiliacion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegistrarAfiliacionDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.afiliacionesService.registrar(id, dto, usuario);
  }

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Post(':id/afiliaciones/:afiliacionId/cerrar')
  cerrarAfiliacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('afiliacionId', ParseUUIDPipe) afiliacionId: string,
    @Body() dto: CerrarAfiliacionDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.afiliacionesService.cerrar(id, afiliacionId, dto, usuario);
  }

  // ---------- Documentos (RF-PER-06) ----------

  @Permiso(PERMISOS.SST_VER)
  @Get(':id/documentos')
  listarDocumentos(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.documentosService.listar(id, usuario);
  }

  // Cada tipo de documento exige su propio permiso: lo comprueba el servicio.
  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post(':id/documentos')
  @UseInterceptors(FileInterceptor('documento', { limits: { fileSize: TAMANO_MAXIMO_DOCUMENTO } }))
  subirDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body('tipo') tipo: string | undefined,
    @Body('descripcion') descripcion: string | undefined,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    if (!tipo || !(Object.values(TipoDocumentoTrabajador) as string[]).includes(tipo)) {
      throw new BadRequestException(`El tipo de documento debe ser uno de: ${Object.values(TipoDocumentoTrabajador).join(', ')}`);
    }
    if (descripcion !== undefined && typeof descripcion !== 'string') {
      throw new BadRequestException('La descripción debe ser texto');
    }
    return this.documentosService.subir(id, archivo, tipo as TipoDocumentoTrabajador, descripcion, usuario);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get(':id/documentos/:documentoId')
  async descargarDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @CurrentUsuario() usuario: UsuarioAutenticado,
    @Res() res: Response,
  ) {
    const { buffer, contentType, nombre } = await this.documentosService.leer(id, documentoId, usuario);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  }
}
