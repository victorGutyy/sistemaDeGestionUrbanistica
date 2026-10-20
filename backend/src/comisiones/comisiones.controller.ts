import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ComisionesService } from './comisiones.service.js';
import { AnularComisionDto, ListarComisionesQueryDto, PagarComisionDto } from './dto/comision.dto.js';

const TIPOS_DE_SOPORTE_PERMITIDOS = ['image/jpeg', 'image/png', 'application/pdf'];
const TAMANO_MAXIMO_SOPORTE = 10 * 1024 * 1024;

// Comisiones de venta (RF-COM-01 a 04 y RF-REP-08). Se generan solas al activarse una venta con vendedor; aquí se
// consultan, se pagan y se anulan.
@Controller('comisiones')
export class ComisionesController {
  constructor(private readonly comisionesService: ComisionesService) {}

  @Permiso(PERMISOS.COMISIONES_VER)
  @Get()
  listar(@Query() filtro: ListarComisionesQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.comisionesService.listar(filtro, usuario);
  }

  // Antes que ":id" para que "exportar" no se tome como un identificador.
  @Permiso(PERMISOS.COMISIONES_VER)
  @Get('exportar')
  async exportar(@Query() filtro: ListarComisionesQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const buffer = await this.comisionesService.exportarExcel(filtro, usuario);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="comisiones.xlsx"',
    });
    res.send(buffer);
  }

  @Permiso(PERMISOS.COMISIONES_VER)
  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.comisionesService.obtener(id, usuario);
  }

  @Permiso(PERMISOS.COMISIONES_PAGAR)
  @Post(':id/pagar')
  @UseInterceptors(
    FileInterceptor('soporte', {
      limits: { fileSize: TAMANO_MAXIMO_SOPORTE },
      fileFilter: (_req, file, callback) => {
        if (!TIPOS_DE_SOPORTE_PERMITIDOS.includes(file.mimetype)) {
          callback(new BadRequestException('El soporte debe ser una imagen (JPG/PNG) o un PDF'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  pagar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PagarComisionDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
    @UploadedFile() soporte?: Express.Multer.File,
  ) {
    return this.comisionesService.pagar(id, dto, usuario, soporte);
  }

  @Permiso(PERMISOS.COMISIONES_ANULAR)
  @Post(':id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularComisionDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.comisionesService.anular(id, dto, usuario);
  }
}
