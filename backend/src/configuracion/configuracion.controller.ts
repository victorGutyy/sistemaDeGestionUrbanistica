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
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import { Public } from '../auth/public.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { MedioPago, TipoVendedor } from '../generated/prisma/enums.js';
import { ConfiguracionService } from './configuracion.service.js';
import { ActualizarComisionDto } from './dto/actualizar-comision.dto.js';
import { ActualizarEmpresaDto } from './dto/actualizar-empresa.dto.js';
import { ActualizarMedioPagoDto } from './dto/actualizar-medio-pago.dto.js';
import { ActualizarParametrosDto } from './dto/actualizar-parametros.dto.js';
import {
  ActualizarCategoriaGastoDto,
  ActualizarCategoriaIngresoDto,
  CrearCategoriaGastoDto,
  CrearCategoriaIngresoDto,
} from './dto/categoria-gasto.dto.js';
import { ActualizarCuentaBancariaDto, CrearCuentaBancariaDto } from './dto/cuenta-bancaria.dto.js';

const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024;

// Escritura: solo quien tenga el permiso configuracion.editar (el gerente).
// Lectura completa: también el administrador (configuracion.ver), que necesita los
// medios de pago, cuentas y categorías para operar.
// Todo lo de configuración es de la empresa, no de un proyecto: no es para usuarios con alcance
// restringido. Solo los medios de pago activos se exceptúan, porque se necesitan al registrar abonos.
@SoloAlcanceTotal()
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
  actualizarEmpresa(@Body() dto: ActualizarEmpresaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.actualizarEmpresa(dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Put('parametros')
  actualizarParametros(@Body() dto: ActualizarParametrosDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.actualizarParametros(dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('logo')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: TAMANO_MAXIMO_LOGO } }))
  subirLogo(@UploadedFile() archivo: Express.Multer.File | undefined, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.guardarLogo(this.exigirArchivo(archivo), usuario);
  }

  // No borra el archivo: solo deja de usarse (se vuelve a mostrar el logo genérico).
  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Delete('logo')
  quitarLogo(@CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.quitarLogo(usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('cuentas')
  crearCuenta(@Body() dto: CrearCuentaBancariaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.crearCuenta(dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('cuentas/:id')
  actualizarCuenta(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCuentaBancariaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.actualizarCuenta(id, dto, usuario);
  }

  @Permiso(PERMISOS.ABONOS_REGISTRAR)
  @SoloAlcanceTotal(false)
  @Get('medios-pago')
  listarMediosPago() {
    return this.configuracionService.listarMediosPago();
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('medios-pago/:medio')
  actualizarMedioPago(
    @Param('medio', new ParseEnumPipe(MedioPago)) medio: MedioPago,
    @Body() dto: ActualizarMedioPagoDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.configuracionService.actualizarMedioPago(medio, dto.activo, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('categorias-gasto')
  crearCategoriaGasto(@Body() dto: CrearCategoriaGastoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.crearCategoriaGasto(dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('categorias-gasto/:id')
  actualizarCategoriaGasto(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCategoriaGastoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.actualizarCategoriaGasto(id, dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('categorias-ingreso')
  crearCategoriaIngreso(@Body() dto: CrearCategoriaIngresoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.crearCategoriaIngreso(dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Patch('categorias-ingreso/:id')
  actualizarCategoriaIngreso(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCategoriaIngresoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.configuracionService.actualizarCategoriaIngreso(id, dto, usuario);
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Put('comisiones/:tipo')
  actualizarComision(
    @Param('tipo', new ParseEnumPipe(TipoVendedor)) tipo: TipoVendedor,
    @Body() dto: ActualizarComisionDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.configuracionService.actualizarComision(tipo, dto.valor, usuario);
  }

  private exigirArchivo(archivo: Express.Multer.File | undefined): Express.Multer.File {
    if (!archivo) {
      throw new BadRequestException('Falta el archivo del logo (campo "logo")');
    }
    return archivo;
  }
}
