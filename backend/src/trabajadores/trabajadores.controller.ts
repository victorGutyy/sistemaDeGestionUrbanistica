import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CrearTrabajadorDto } from './dto/crear-trabajador.dto.js';
import { TrabajadoresService } from './trabajadores.service.js';

@SoloAlcanceTotal()
@Controller('trabajadores')
export class TrabajadoresController {
  constructor(private readonly trabajadoresService: TrabajadoresService) {}

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

  @Permiso(PERMISOS.NOMINA_VER)
  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.trabajadoresService.buscarPorId(id);
  }
}
