import { IsBoolean } from 'class-validator';

export class ActualizarMedioPagoDto {
  @IsBoolean()
  activo!: boolean;
}
