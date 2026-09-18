import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EstadoLote } from '../../generated/prisma/enums.js';

export class ListarLotesQueryDto {
  @IsOptional()
  @IsEnum(EstadoLote)
  estado?: EstadoLote;

  @IsOptional()
  @IsUUID()
  proyectoId?: string;
}
