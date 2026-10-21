import { IsBoolean, IsInt, IsNumber, Max, Min, ValidateIf } from 'class-validator';

// Los porcentajes se envían como número (30 = 30 %), con máximo 2 decimales.
export class ActualizarParametrosDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeCuotaInicial!: number;

  @IsInt()
  @Min(1)
  @Max(120)
  plazoMaximoMeses!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  tasaFinanciacionMensual!: number;

  // null = el gerente todavía no define la tasa: no se calcula interés de mora.
  @ValidateIf((dto: ActualizarParametrosDto) => dto.tasaMoraMensual !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  tasaMoraMensual!: number | null;

  @IsInt()
  @Min(0)
  @Max(365)
  diasGraciaMora!: number;

  @IsInt()
  @Min(0)
  @Max(90)
  diasSemaforoAmarillo!: number;

  @IsInt()
  @Min(0)
  @Max(60)
  diasAntesRecordatorio!: number;

  // Cada cuántos días se repite el aviso de mora a una venta con cuotas vencidas (RF-NOT-03).
  @IsInt()
  @Min(1)
  @Max(90)
  diasEntreAvisosMora!: number;

  // Si el recibo de cada abono nuevo sale solo al correo del cliente (RF-NOT-01).
  @IsBoolean()
  enviarReciboPorCorreo!: boolean;

  @IsInt()
  @Min(1)
  @Max(20)
  intentosMaximosLogin!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  minutosBloqueoLogin!: number;

  @IsInt()
  @Min(1)
  @Max(480)
  minutosInactividad!: number;
}
