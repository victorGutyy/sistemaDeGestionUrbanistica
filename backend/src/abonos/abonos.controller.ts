import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import { CrearAbonoDto } from './dto/crear-abono.dto.js';

const TIPOS_DE_COMPROBANTE_PERMITIDOS = ['image/jpeg', 'image/png', 'application/pdf'];
const TAMANO_MAXIMO_COMPROBANTE = 10 * 1024 * 1024;

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
  listar(@Query('ventaId') ventaId: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.abonosService.listarPorVenta(ventaId, usuario);
  }

  @Permiso(PERMISOS.ABONOS_VER)
  @Get(':id/comprobante')
  async descargarComprobante(@Param('id') id: string, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const { buffer, contentType } = await this.abonosService.obtenerComprobante(id, usuario);
    res.set({ 'Content-Type': contentType });
    res.send(buffer);
  }
}
