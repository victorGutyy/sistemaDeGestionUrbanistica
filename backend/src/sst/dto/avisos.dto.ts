import { IsEnum, IsOptional } from 'class-validator';
import { EstadoNotificacion, TipoAvisoSst } from '../../generated/prisma/enums.js';

export class ListarAvisosSstQueryDto {
  @IsOptional()
  @IsEnum(TipoAvisoSst)
  tipo?: TipoAvisoSst;

  @IsOptional()
  @IsEnum(EstadoNotificacion)
  estado?: EstadoNotificacion;
}
