import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { EstadoLote } from '../../generated/prisma/enums.js';

export class ListarLotesQueryDto {
  @IsOptional()
  @IsEnum(EstadoLote)
  estado?: EstadoLote;

  @IsOptional()
  @IsUUID()
  proyectoId?: string;

  @IsOptional()
  @IsUUID()
  manzanaId?: string;

  // Busca por número de lote o por texto de los linderos.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  buscar?: string;
}
