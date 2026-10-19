import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../auditoria.js';

export class ListarAuditoriaQueryDto {
  // Días calendario (ambos incluidos), formato YYYY-MM-DD.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  // Tipo de registro (venta, abono, cierre de caja...).
  @IsOptional()
  @IsIn(Object.keys(ENTIDADES_AUDITORIA), { message: 'entidad no es un tipo de registro válido' })
  entidad?: string;

  @IsOptional()
  @IsIn(Object.keys(ACCIONES_AUDITORIA), { message: 'accion no es una acción válida' })
  accion?: string;

  // Busca dentro del resumen de la acción.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  buscar?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}
