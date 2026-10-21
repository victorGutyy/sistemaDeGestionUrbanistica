import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Filtros de la lista de abonos por verificar (RF-REC-10).
export class ListarPorVerificarQueryDto {
  @IsOptional()
  @IsUUID()
  cuentaId?: string;

  @IsOptional()
  @IsUUID()
  proyectoId?: string;

  // Fecha del pago, formato YYYY-MM-DD.
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;
}

// Confirma de una vez varios abonos contra el extracto: o se verifican todos o no se verifica ninguno.
export class VerificarAbonosDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un abono' })
  @ArrayMaxSize(200, { message: 'Se pueden verificar hasta 200 abonos a la vez' })
  @IsUUID('all', { each: true })
  ids!: string[];

  // Por ejemplo, el número del movimiento en el extracto.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nota?: string;
}

export class VerificarAbonoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nota?: string;
}
