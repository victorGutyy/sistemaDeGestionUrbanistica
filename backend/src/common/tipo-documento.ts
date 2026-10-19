import { TipoDocumento } from '../generated/prisma/enums.js';

// Nombre en español de cada tipo de documento (pantallas, PDF y plantilla de importación).
export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  NIT: 'NIT',
  PASAPORTE: 'Pasaporte',
  TI: 'Tarjeta de identidad',
  OTRO: 'Otro',
};

// Lo que se escribe en la hoja Clientes de la plantilla de importación, y a qué tipo corresponde.
export const OPCIONES_TIPO_DOCUMENTO_EXCEL: { texto: string; tipo: TipoDocumento }[] = [
  { texto: 'CC', tipo: TipoDocumento.CC },
  { texto: 'CE', tipo: TipoDocumento.CE },
  { texto: 'NIT', tipo: TipoDocumento.NIT },
  { texto: 'Pasaporte', tipo: TipoDocumento.PASAPORTE },
  { texto: 'TI', tipo: TipoDocumento.TI },
  { texto: 'Otro', tipo: TipoDocumento.OTRO },
];
