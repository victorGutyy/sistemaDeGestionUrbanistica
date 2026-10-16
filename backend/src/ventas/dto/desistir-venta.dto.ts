import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { MedioPago } from '../../generated/prisma/enums.js';

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

  // Con qué se devuelve el dinero y de qué cuenta sale: obligatorio si hay valor a devolver, porque la
  // devolución queda registrada como un egreso (RF-EGR-01).
  @IsOptional()
  @IsEnum(MedioPago)
  medioPagoDevolucion?: MedioPago;

  @IsOptional()
  @IsUUID()
  cuentaDevolucionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenciaDevolucion?: string;
}
