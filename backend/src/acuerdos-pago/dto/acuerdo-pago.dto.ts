import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Crear un acuerdo de pago (CC-07). El motivo es obligatorio: es lo único que explica después por qué la venta no recibe
// avisos ni causa interés.
export class CrearAcuerdoPagoDto {
  @IsString()
  @MinLength(10, { message: 'Explica el acuerdo con al menos 10 caracteres' })
  @MaxLength(500)
  motivo!: string;

  // Primer día del acuerdo; si se omite, hoy.
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde?: string;

  // Último día del acuerdo (opcional). Al día siguiente se reanudan los avisos y el interés. Sin fecha, sigue hasta que se finalice.
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta?: string;
}

export class FinalizarAcuerdoPagoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
