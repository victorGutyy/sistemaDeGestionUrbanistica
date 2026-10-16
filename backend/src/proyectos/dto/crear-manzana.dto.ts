import { IsString, MaxLength, MinLength } from 'class-validator';

export class CrearManzanaDto {
  // Por ejemplo "A" o "Manzana 3". Única dentro del proyecto.
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  nombre!: string;
}
