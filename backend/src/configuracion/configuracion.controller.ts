import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { MedioPago, TipoVendedor } from '../generated/prisma/enums.js';
import { ConfiguracionService } from './configuracion.service.js';
import { ActualizarComisionDto } from './dto/actualizar-comision.dto.js';
import { ActualizarEmpresaDto } from './dto/actualizar-empresa.dto.js';
import { ActualizarMedioPagoDto } from './dto/actualizar-medio-pago.dto.js';
import { ActualizarParametrosDto } from './dto/actualizar-parametros.dto.js';
import { ActualizarCategoriaGastoDto, CrearCategoriaGastoDto } from './dto/categoria-gasto.dto.js';
import { ActualizarCuentaBancariaDto, CrearCuentaBancariaDto } from './dto/cuenta-bancaria.dto.js';

const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024;

// Escritura: solo el máximo rol (hoy PROPIETARIO; se renombra a GERENTE en el
// paso 2.2). Lectura completa: también el administrador, que necesita los
// medios de pago, cuentas y categorías para operar.
@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  // Sin sesión: la pantalla de ingreso necesita el nombre, el color y el logo.
  // Es marca de la empresa, no un soporte de pago ni un dato de un cliente.
  @Public()
  @Get('publica')
  publica() {
    return this.configuracionService.obtenerPublica();
  }

  @Public()
  @Get('logo')
  async logo(@Res() res: Response) {
    const { buffer, contentType } = await this.configuracionService.leerLogo();
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300' });
    res.send(buffer);
  }

  @Permiso(PERMISOS.CONFIGURACION_VER)
  @Get()
  completa() {
    return this.configuracionService.obtenerCompleta();
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Put('empresa')
  actualizarEmpresa(@Body() dto: ActualizarEmpresaDto) {
    return this.configuracionService.actualizarEmpresa(dto);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Put('parametros')
  actualizarParametros(@Body() dto: ActualizarParametrosDto) {
    return this.configuracionService.actualizarParametros(dto);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('logo')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: TAMANO_MAXIMO_LOGO } }))
  subirLogo(@UploadedFile() archivo: Express.Multer.File | undefined) {
    return this.configuracionService.guardarLogo(this.exigirArchivo(archivo));
  }

  // No borra el archivo: solo deja de usarse (se vuelve a mostrar el logo genérico).
  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Delete('logo')
  quitarLogo() {
    return this.configuracionService.quitarLogo();
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('cuentas')
  crearCuenta(@Body() dto: CrearCuentaBancariaDto) {
    return this.configuracionService.crearCuenta(dto);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('cuentas/:id')
  actualizarCuenta(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCuentaBancariaDto) {
    return this.configuracionService.actualizarCuenta(id, dto);
  }

  @Permiso(PERMISOS.ABONOS_REGISTRAR)
  @Get('medios-pago')
  listarMediosPago() {
    return this.configuracionService.listarMediosPago();
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('medios-pago/:medio')
  actualizarMedioPago(
    @Param('medio', new ParseEnumPipe(MedioPago)) medio: MedioPago,
    @Body() dto: ActualizarMedioPagoDto,
  ) {
    return this.configuracionService.actualizarMedioPago(medio, dto.activo);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('categorias-gasto')
  crearCategoriaGasto(@Body() dto: CrearCategoriaGastoDto) {
    return this.configuracionService.crearCategoriaGasto(dto);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('categorias-gasto/:id')
  actualizarCategoriaGasto(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCategoriaGastoDto) {
    return this.configuracionService.actualizarCategoriaGasto(id, dto);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Put('comisiones/:tipo')
  actualizarComision(
    @Param('tipo', new ParseEnumPipe(TipoVendedor)) tipo: TipoVendedor,
    @Body() dto: ActualizarComisionDto,
  ) {
    return this.configuracionService.actualizarComision(tipo, dto.valor);
  }

  private exigirArchivo(archivo: Express.Multer.File | undefined): Express.Multer.File {
    if (!archivo) {
      throw new BadRequestException('Falta el archivo del logo (campo "logo")');
    }
    return archivo;
  }
}
