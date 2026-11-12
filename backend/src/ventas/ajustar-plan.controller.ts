import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { AjustarPlanService } from './ajustar-plan.service.js';
import { AjustarPlanDto } from './dto/ajustar-plan.dto.js';

// Reprogramar las fechas del plan de pagos de una venta ya registrada (CC-08). Con soloVistaPrevia no guarda nada.
@Controller('ventas')
export class AjustarPlanController {
  constructor(private readonly ajustarPlan: AjustarPlanService) {}

  @Permiso(PERMISOS.VENTAS_AJUSTAR_PLAN)
  @Post(':id/ajustar-plan')
  ajustar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AjustarPlanDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ajustarPlan.ajustar(id, dto, usuario);
  }
}
