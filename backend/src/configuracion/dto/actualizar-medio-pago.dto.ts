import { IsBoolean, IsOptional } from 'class-validator';

// Se envía lo que cambia: si el medio está habilitado y/o si sus abonos quedan por verificar contra el extracto.
export class ActualizarMedioPagoDto {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsBoolean()
  requiereVerificacion?: boolean;
}
