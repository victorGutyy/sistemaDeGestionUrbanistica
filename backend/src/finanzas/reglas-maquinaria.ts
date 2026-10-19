import { BadRequestException } from '@nestjs/common';
import { TipoMovimiento } from '../generated/prisma/enums.js';

// ---------------------------------------------------------------------------------------------
// Reglas de un movimiento de un proyecto de maquinaria (RF-MAQ-03, 04 y 06). Función pura: valida lo que la base de
// datos también exige y da mensajes claros en vez de errores de restricción.
// ---------------------------------------------------------------------------------------------

export interface DatosReglasMaquinaria {
  tipo: TipoMovimiento;
  // true si el movimiento es de un proyecto de tipo Maquinaria.
  esProyectoMaquinaria: boolean;
  equipoId?: string | null;
  // "Gasto (o ingreso) general de la flota": no es de un equipo en particular.
  flota?: boolean;
  // Días calendario "aaaa-mm-dd".
  periodoDesde?: string | null;
  periodoHasta?: string | null;
  terceroNombre?: string | null;
  terceroDocumento?: string | null;
  tieneSoporte: boolean;
  motivoSinSoporte?: string | null;
  // Nombre de la categoría de gasto si es "solo maquinaria"; null si es una categoría general.
  categoriaSoloMaquinaria?: string | null;
}

const vacio = (texto: string | null | undefined) => !texto || texto.trim() === '';

export function validarMovimientoMaquinaria(datos: DatosReglasMaquinaria): void {
  const hayEquipo = Boolean(datos.equipoId);
  const hayFlota = Boolean(datos.flota);
  const hayPeriodo = Boolean(datos.periodoDesde) || Boolean(datos.periodoHasta);

  if (!datos.esProyectoMaquinaria) {
    if (hayEquipo || hayFlota || hayPeriodo) {
      throw new BadRequestException('Solo los proyectos de maquinaria manejan equipos y períodos de alquiler');
    }
    if (datos.categoriaSoloMaquinaria) {
      throw new BadRequestException(`La categoría "${datos.categoriaSoloMaquinaria}" es propia de la maquinaria: solo se usa en proyectos de maquinaria`);
    }
    return;
  }

  // RF-MAQ-03: a un equipo o a la flota, y con soporte o el motivo de no tenerlo (egresos e ingresos).
  if (hayEquipo && hayFlota) {
    throw new BadRequestException('Elige el equipo o márcalo como general de la flota, no las dos cosas');
  }
  if (!hayEquipo && !hayFlota) {
    throw new BadRequestException('Indica el equipo al que pertenece el movimiento, o márcalo como general de la flota');
  }
  if (!datos.tieneSoporte && vacio(datos.motivoSinSoporte)) {
    throw new BadRequestException('En maquinaria, todo ingreso y egreso lleva soporte adjunto o el motivo de no tenerlo');
  }

  if (datos.tipo === TipoMovimiento.INGRESO) {
    // RF-MAQ-04: el alquiler registra cliente y período alquilado.
    if (vacio(datos.terceroNombre) || vacio(datos.terceroDocumento)) {
      throw new BadRequestException('El ingreso por alquiler registra el cliente: su nombre y su documento');
    }
    if (!datos.periodoDesde || !datos.periodoHasta) {
      throw new BadRequestException('El ingreso por alquiler registra el período alquilado: desde y hasta');
    }
    if (datos.periodoHasta < datos.periodoDesde) {
      throw new BadRequestException('El período alquilado termina antes de empezar: revisa las fechas');
    }
  } else if (hayPeriodo) {
    throw new BadRequestException('El período alquilado solo aplica a los ingresos por alquiler');
  }
}
