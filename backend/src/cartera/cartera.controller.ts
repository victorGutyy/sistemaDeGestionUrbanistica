import { Controller, Get } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CarteraService } from './cartera.service.js';

@Controller('cartera')
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Permiso(PERMISOS.CARTERA_VER)
  @Get()
  listarPorCliente(@CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.carteraService.listarPorCliente(usuario);
  }

  @Permiso(PERMISOS.CARTERA_VER)
  @Get('reporte')
  reportePorProyecto(@CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.carteraService.reportePorProyecto(usuario);
  }
}
