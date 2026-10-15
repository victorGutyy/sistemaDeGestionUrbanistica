import { Matches } from 'class-validator';

export class ActualizarComisionDto {
  // Valor en pesos como texto decimal (para no perder precisión): "1000000" o "1000000.50".
  @Matches(/^\d{1,12}(\.\d{1,2})?$/, { message: 'valor debe ser un monto en pesos, sin signo, con máximo 2 decimales' })
  valor!: string;
}
