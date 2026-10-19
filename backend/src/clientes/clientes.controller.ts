import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ClientesService } from './clientes.service.js';
import { ActualizarClienteDto } from './dto/actualizar-cliente.dto.js';
import { CrearClienteDto } from './dto/crear-cliente.dto.js';
import { ListarClientesQueryDto } from './dto/listar-clientes-query.dto.js';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Permiso(PERMISOS.CLIENTES_CREAR)
  @Post()
  crear(@Body() dto: CrearClienteDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.clientesService.crear(dto, usuario);
  }

  @Permiso(PERMISOS.CLIENTES_VER)
  @Get()
  listar(@Query() query: ListarClientesQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.clientesService.listar(usuario, query.buscar);
  }

  // Ficha del cliente: datos, resumen de cartera y sus ventas con cuotas y abonos.
  @Permiso(PERMISOS.CLIENTES_VER)
  @Get(':id')
  ficha(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.clientesService.ficha(id, usuario);
  }

  @Permiso(PERMISOS.CLIENTES_EDITAR)
  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarClienteDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.clientesService.actualizar(id, dto, usuario);
  }

  @Permiso(PERMISOS.CLIENTES_VER)
  @Get(':id/estado-cuenta')
  async estadoCuenta(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const { buffer, nombreArchivo } = await this.clientesService.estadoCuentaPdf(id, usuario);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nombreArchivo}"` });
    res.send(buffer);
  }
}
