import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsOptional, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ActualizarUsuarioDto {
  @IsOptional()
  @MinLength(3)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  rolId?: string;

  // Alcance por proyecto: omitido = sin cambios (al crear, ve todos). false exige proyectoIds
  // y solo se acepta en roles marcados como limitables por proyecto.
  @IsOptional()
  @IsBoolean()
  todosLosProyectos?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  proyectoIds?: string[];
}
