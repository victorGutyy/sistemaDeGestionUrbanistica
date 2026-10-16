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
import { AbonosService } from './abonos.service.js';
import { AnularAbonoDto } from './dto/anular-abono.dto.js';
import { BuscarRecibosQueryDto } from './dto/buscar-recibos-query.dto.js';
import { CrearAbonoDto } from './dto/crear-abono.dto.js';

const TIPOS_DE_COMPROBANTE_PERMITIDOS = ['image/jpeg', 'image/png', 'application/pdf'];
const TAMANO_MAXIMO_COMPROBANTE = 10 * 1024 * 1024;

// La búsqueda de recibos está aparte de /abonos: el recibo se consulta por su número, no por la venta.
@Controller('recibos')
export class RecibosController {
  constructor(private readonly abonosService: AbonosService) {}

  @Permiso(PERMISOS.ABONOS_VER)
  @Get()
  buscar(@Query() query: BuscarRecibosQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.abonosService.buscarRecibos(query, usuario);
  }
}

@Controller('abonos')
export class AbonosController {
  constructor(private readonly abonosService: AbonosService) {}

  @Permiso(PERMISOS.ABONOS_REGISTRAR)
  @Post()
  @UseInterceptors(
    FileInterceptor('comprobante', {
      limits: { fileSize: TAMANO_MAXIMO_COMPROBANTE },
      fileFilter: (_req, file, callback) => {
        if (!TIPOS_DE_COMPROBANTE_PERMITIDOS.includes(file.mimetype)) {
          callback(new BadRequestException('El comprobante debe ser una imagen (JPG/PNG) o un PDF'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  crear(@Body() dto: CrearAbonoDto, @CurrentUsuario() usuario: UsuarioAutenticado, @UploadedFile() comprobante?: Express.Multer.File) {
    return this.abonosService.crear(dto, usuario, comprobante);
  }

  @Permiso(PERMISOS.ABONOS_VER)
  @Get()
  listar(@Query('ventaId', ParseUUIDPipe) ventaId: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.abonosService.listarPorVenta(ventaId, usuario);
  }

  @Permiso(PERMISOS.ABONOS_ANULAR)
  @Post(':id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularAbonoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.abonosService.anular(id, dto, usuario);
  }

  @Permiso(PERMISOS.ABONOS_VER)
  @Get(':id/recibo')
  async descargarRecibo(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const { buffer, nombreArchivo } = await this.abonosService.obtenerPdfRecibo(id, usuario);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nombreArchivo}"` });
    res.send(buffer);
  }

  @Permiso(PERMISOS.ABONOS_VER)
  @Get(':id/comprobante')
  async descargarComprobante(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const { buffer, contentType } = await this.abonosService.obtenerComprobante(id, usuario);
    res.set({ 'Content-Type': contentType });
    res.send(buffer);
  }
}
