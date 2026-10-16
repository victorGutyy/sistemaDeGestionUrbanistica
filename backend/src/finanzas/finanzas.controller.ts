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
import { AnularMovimientoDto } from './dto/anular-movimiento.dto.js';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto.js';
import { FiltroPeriodoDto } from './dto/filtro-periodo.dto.js';
import { ListarMovimientosQueryDto } from './dto/listar-movimientos-query.dto.js';
import { FinanzasService } from './finanzas.service.js';

const TIPOS_DE_SOPORTE_PERMITIDOS = ['image/jpeg', 'image/png', 'application/pdf'];
const TAMANO_MAXIMO_SOPORTE = 10 * 1024 * 1024;

@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly finanzasService: FinanzasService) {}

  @Permiso(PERMISOS.FINANZAS_REGISTRAR)
  @Post('movimientos')
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
  crear(@Body() dto: CrearMovimientoDto, @CurrentUsuario() usuario: UsuarioAutenticado, @UploadedFile() soporte?: Express.Multer.File) {
    return this.finanzasService.crear(dto, usuario, soporte);
  }

  @Permiso(PERMISOS.FINANZAS_VER)
  @Get('movimientos')
  listar(@Query() filtro: ListarMovimientosQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.finanzasService.listar(filtro, usuario);
  }

  @Permiso(PERMISOS.FINANZAS_VER)
  @Get('movimientos/:id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.finanzasService.obtener(id, usuario);
  }

  @Permiso(PERMISOS.FINANZAS_ANULAR)
  @Post('movimientos/:id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularMovimientoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.finanzasService.anular(id, dto, usuario);
  }

  @Permiso(PERMISOS.FINANZAS_VER)
  @Get('movimientos/:id/soporte')
  async descargarSoporte(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const { buffer, contentType } = await this.finanzasService.obtenerSoporte(id, usuario);
    res.set({ 'Content-Type': contentType });
    res.send(buffer);
  }

  @Permiso(PERMISOS.FINANZAS_VER)
  @Get('consolidado')
  consolidado(@Query() filtro: FiltroPeriodoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.finanzasService.consolidado(filtro, usuario);
  }

  @Permiso(PERMISOS.FINANZAS_VER)
  @Get('proyectos/:id')
  finanzasDeProyecto(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filtro: FiltroPeriodoDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.finanzasService.finanzasDeProyecto(id, filtro, usuario);
  }
}
