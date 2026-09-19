import { IsEnum } from 'class-validator';
import { EstadoUsuario } from '../../generated/prisma/enums.js';

export class ActualizarEstadoUsuarioDto {
  @IsEnum(EstadoUsuario)
  estado!: EstadoUsuario;
}
