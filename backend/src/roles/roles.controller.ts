import { Controller, Get } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import { RolesService } from './roles.service.js';

@SoloAlcanceTotal()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Permiso(PERMISOS.USUARIOS_GESTIONAR)
  @Get()
  listar() {
    return this.rolesService.listar();
  }
}
