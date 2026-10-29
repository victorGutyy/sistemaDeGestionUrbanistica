import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { EntidadRecobro } from '../generated/prisma/enums.js';
import { AusentismoService } from './ausentismo.service.js';
import {
  ActualizarAusentismoDto,
  ActualizarRecobroDto,
  AnularAusentismoDto,
  CorregirLiquidacionDto,
  ListarAusentismosQueryDto,
  ListarRecobrosQueryDto,
  NovedadesAusentismoQueryDto,
  NovedadesDelPeriodoQueryDto,
  RegistrarAusentismoDto,
  ResumenAusentismoQueryDto,
} from './dto/ausentismo.dto.js';
import { InformesAusentismoService } from './informes-ausentismo.service.js';
import { RecobrosAusentismoService } from './recobros-ausentismo.service.js';

const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

// Ausentismo (incapacidades y licencias). Ver y registrar: sst.ver y sst.gestionar. Qué se ve dentro de cada respuesta lo decide
// el servicio con los permisos aparte de los diagnósticos (sst.diagnosticos_ver) y de los valores (sst.valores_ver), no la
// ruta. Corregir la liquidación cambia valores: exige poder verlos y poder gestionar. Los certificados adjuntos traen el
// diagnóstico: se leen con sst.diagnosticos_ver. Son datos de la empresa, no de un proyecto.
@SoloAlcanceTotal()
@Controller('sst/ausentismo')
export class AusentismoController {
  constructor(
    private readonly ausentismo: AusentismoService,
    private readonly recobros: RecobrosAusentismoService,
    private readonly informes: InformesAusentismoService,
  ) {}

  @Permiso(PERMISOS.SST_VER)
  @Get()
  listar(@Query() filtro: ListarAusentismosQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ausentismo.listar(filtro, usuario);
  }

  // Las rutas fijas (resumen, recobros, novedades) van antes de las de un ausentismo por identificador (":id").

  @Permiso(PERMISOS.SST_VER)
  @Get('resumen')
  resumen(@Query() filtro: ResumenAusentismoQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.informes.resumenMensual(filtro.anio, usuario);
  }

  // El seguimiento del recobro es dinero: ven el estado todos los que usan el módulo y los valores, quien puede verlos.
  @Permiso(PERMISOS.SST_VER)
  @Get('recobros')
  listarRecobros(@Query() filtro: ListarRecobrosQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.recobros.listar(filtro, usuario);
  }

  // Lo que se le entrega a la nómina trae valores: exige poder verlos. Nunca lleva diagnósticos.
  @Permiso(PERMISOS.SST_VER, PERMISOS.SST_VALORES_VER)
  @Get('novedades')
  novedades(@Query() filtro: NovedadesAusentismoQueryDto) {
    return this.informes.novedades(filtro.anio, filtro.mes);
  }

  // Lo que se propone como novedad al registrar un pago de nómina. Lo usa quien paga nómina y puede ver valores.
  @Permiso(PERMISOS.NOMINA_GESTIONAR, PERMISOS.SST_VALORES_VER)
  @Get('novedades-del-periodo')
  novedadesDelPeriodo(@Query() filtro: NovedadesDelPeriodoQueryDto) {
    return this.informes.novedadesDelPeriodo(filtro.trabajadorId, filtro.desde, filtro.hasta);
  }

  @Permiso(PERMISOS.SST_VER, PERMISOS.SST_VALORES_VER)
  @Get('novedades/excel')
  async novedadesExcel(@Query() filtro: NovedadesAusentismoQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const { buffer, contentType, nombreArchivo } = await this.informes.novedadesExcel(filtro.anio, filtro.mes, usuario);
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${nombreArchivo}"` });
    res.send(buffer);
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

  // Cambiar el recobro es mover plata: exige poder gestionar y poder ver valores.
  @Permiso(PERMISOS.SST_GESTIONAR, PERMISOS.SST_VALORES_VER)
  @Patch(':id/recobros/:entidad')
  actualizarRecobro(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entidad', new ParseEnumPipe(EntidadRecobro)) entidad: EntidadRecobro,
    @Body() dto: ActualizarRecobroDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.recobros.actualizar(id, entidad, dto, usuario);
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
