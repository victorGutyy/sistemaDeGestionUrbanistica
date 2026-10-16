import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { EstadoAbono } from '../../generated/prisma/enums.js';

export class BuscarRecibosQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  buscar?: string;

  @IsOptional()
  @IsEnum(EstadoAbono)
  estado?: EstadoAbono;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;
}
