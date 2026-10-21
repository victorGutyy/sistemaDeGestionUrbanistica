// Deja un teléfono listo para el enlace de WhatsApp (wa.me): solo dígitos, con el indicativo del país y sin "+".
// WhatsApp solo funciona con celulares: un fijo colombiano (o cualquier número que no se reconozca) devuelve null.
//  · Celular colombiano de 10 dígitos que empieza por 3 → se le antepone 57.
//  · Con 57 delante y 12 dígitos en total → se deja igual.
//  · Con "+" o "00" delante → número internacional, de 8 a 15 dígitos.
export function normalizarTelefonoWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const texto = telefono.trim();
  const conMas = texto.startsWith('+');
  let digitos = texto.replace(/\D/g, '');

  if (conMas || digitos.startsWith('00')) {
    if (digitos.startsWith('00')) digitos = digitos.slice(2);
    return /^[1-9]\d{7,14}$/.test(digitos) ? digitos : null;
  }
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`;
  if (/^573\d{9}$/.test(digitos)) return digitos;
  return null;
}
