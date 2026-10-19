// Nombres y documentos INVENTADOS para la demostración y las pruebas de volumen (nunca datos de personas reales).
// Los documentos son series consecutivas fáciles de reconocer como de prueba.

const NOMBRES = [
  'María Fernanda', 'Juan Camilo', 'Luisa Marina', 'Carlos Andrés', 'Ana Sofía', 'Jorge Iván', 'Diana Carolina', 'Pedro Pablo',
  'Laura Valentina', 'Andrés Felipe', 'Paula Andrea', 'Sergio Alejandro', 'Natalia', 'Camilo', 'Daniela', 'Mauricio',
  'Sandra Milena', 'Hernán Darío', 'Claudia Patricia', 'Julián David',
];

const APELLIDOS = [
  'Rojas', 'Moreno', 'Ortiz', 'Salazar', 'Cárdenas', 'Valencia', 'Giraldo', 'Herrera', 'Londoño', 'Quintero',
  'Arango', 'Zapata', 'Marín', 'Osorio', 'Betancur', 'Cifuentes', 'Montoya', 'Palacio', 'Restrepo', 'Vargas',
];

// Nombre completo determinista a partir de un número (el mismo número da siempre el mismo nombre).
export function nombreInventado(n: number): string {
  const nombre = NOMBRES[n % NOMBRES.length];
  const primero = APELLIDOS[Math.floor(n / NOMBRES.length) % APELLIDOS.length];
  const segundo = APELLIDOS[(n * 7 + 3) % APELLIDOS.length];
  return `${nombre} ${primero} ${segundo}`;
}

export const documentoInventado = (n: number): string => String(1_000_000_000 + n);
export const telefonoInventado = (n: number): string => `300${String(1_000_000 + n).slice(-7)}`;
export const correoInventado = (n: number): string => `cliente${String(n).padStart(3, '0')}@ejemplo.test`;

// Generador pseudoaleatorio con semilla: la misma semilla da siempre la misma "casualidad".
export function generador(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 0x1_0000_0000;
  };
}
