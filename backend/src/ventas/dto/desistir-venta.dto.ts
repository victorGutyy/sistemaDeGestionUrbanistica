import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const SOLO_PESOS = /^\d{1,12}$/;

// Desistimiento de una venta (RF-VEN-08). Los valores a devolver y a retener son datos que escribe
// el gerente: el sistema no los calcula ni mueve dinero; solo los deja registrados.
export class DesistirVentaDto {
  // Fecha del desistimiento, formato YYYY-MM-DD.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener el formato YYYY-MM-DD' })
  fecha!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;

  @IsOptional()
  @Matches(SOLO_PESOS, { message: 'valorDevolver debe ser un valor en pesos enteros' })
  valorDevolver?: string;

  @IsOptional()
  @Matches(SOLO_PESOS, { message: 'valorRetener debe ser un valor en pesos enteros' })
  valorRetener?: string;
}
