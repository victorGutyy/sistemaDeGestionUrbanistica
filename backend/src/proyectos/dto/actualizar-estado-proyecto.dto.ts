import { IsEnum } from 'class-validator';
import { EstadoProyecto } from '../../generated/prisma/enums.js';

export class ActualizarEstadoProyectoDto {
  @IsEnum(EstadoProyecto)
  estado!: EstadoProyecto;
}
