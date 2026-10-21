import { describe, expect, it } from 'vitest';
import { cuotaParaAvisoDeMora, tocaAvisoDeMora } from './aviso-mora.js';
import { enlaceWhatsApp, fechaCorta, mensajeMora, mensajeRecibo, mensajeRecordatorio } from './mensajes.js';
import { generarHtmlMora, generarHtmlRecibo } from './plantillas-correo.js';
import { normalizarTelefonoWhatsApp } from './telefono.js';

describe('normalizarTelefonoWhatsApp', () => {
  it('le pone el indicativo 57 a un celular colombiano de 10 dígitos', () => {
    expect(normalizarTelefonoWhatsApp('3001234567')).toBe('573001234567');
  });

  it('quita espacios, guiones, paréntesis y puntos', () => {
    expect(normalizarTelefonoWhatsApp(' 300-123 45.67 ')).toBe('573001234567');
    expect(normalizarTelefonoWhatsApp('(300) 123 4567')).toBe('573001234567');
  });

  it('deja igual un celular que ya trae el 57, con o sin "+"', () => {
    expect(normalizarTelefonoWhatsApp('573001234567')).toBe('573001234567');
    expect(normalizarTelefonoWhatsApp('+57 300 123 4567')).toBe('573001234567');
  });

  it('acepta un número internacional con + o 00', () => {
    expect(normalizarTelefonoWhatsApp('+1 305 555 0123')).toBe('13055550123');
    expect(normalizarTelefonoWhatsApp('0034 612 345 678')).toBe('34612345678');
  });

  it('rechaza fijos, números cortos o largos y texto sin dígitos', () => {
    expect(normalizarTelefonoWhatsApp('6067451234')).toBeNull();
    expect(normalizarTelefonoWhatsApp('7451234')).toBeNull();
    expect(normalizarTelefonoWhatsApp('30012345678901')).toBeNull();
    expect(normalizarTelefonoWhatsApp('sin teléfono')).toBeNull();
    expect(normalizarTelefonoWhatsApp('')).toBeNull();
    expect(normalizarTelefonoWhatsApp(null)).toBeNull();
    expect(normalizarTelefonoWhatsApp(undefined)).toBeNull();
  });
});

describe('mensajes de WhatsApp', () => {
  const base = { empresa: 'Empresa Prueba', cliente: 'Ana Pérez', proyecto: 'Proyecto Uno', lote: 'L-3' };

  it('el mensaje del recibo trae el número, el valor, la fecha y el saldo', () => {
    const texto = mensajeRecibo({ ...base, numeroRecibo: 'RC-000012', valor: '$500.000', fecha: '21/10/2026', saldoNuevo: '$2.500.000' });
    expect(texto).toContain('Ana Pérez');
    expect(texto).toContain('RC-000012');
    expect(texto).toContain('$500.000');
    expect(texto).toContain('21/10/2026');
    expect(texto).toContain('$2.500.000');
    expect(texto).toContain('Empresa Prueba');
  });

  it('el recordatorio nombra la cuota, la fecha y el valor', () => {
    const texto = mensajeRecordatorio({ ...base, etiquetaCuota: 'Cuota 4', fechaVencimiento: '25/10/2026', valor: '$1.000.000' });
    expect(texto).toContain('cuota 4');
    expect(texto).toContain('25/10/2026');
    expect(texto).toContain('$1.000.000');
  });

  it('el aviso de mora lista cada cuota vencida y el total', () => {
    const texto = mensajeMora({
      ...base,
      cuotas: [
        { etiqueta: 'Cuota 1', fechaVencimiento: '01/10/2026', saldo: '$1.000.000' },
        { etiqueta: 'Cuota 2', fechaVencimiento: '15/10/2026', saldo: '$500.000' },
      ],
      saldoVencido: '$1.500.000',
    });
    expect(texto).toContain('Cuota 1, vencida el 01/10/2026: $1.000.000');
    expect(texto).toContain('Cuota 2, vencida el 15/10/2026: $500.000');
    expect(texto).toContain('$1.500.000');
  });

  it('el enlace de WhatsApp lleva el teléfono y el texto codificado', () => {
    const url = enlaceWhatsApp('573001234567', 'Hola Ana\n¿Cómo estás? 100%');
    expect(url.startsWith('https://wa.me/573001234567?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hola Ana\n¿Cómo estás? 100%');
    expect(url).not.toContain(' ');
    expect(url).not.toContain('\n');
  });

  it('la fecha corta sale dd/mm/aaaa en hora de Bogotá', () => {
    // 2026-10-21 03:00 UTC sigue siendo el 20 a las 22:00 en Bogotá.
    expect(fechaCorta(new Date('2026-10-21T03:00:00Z'))).toBe('20/10/2026');
    expect(fechaCorta(new Date('2026-10-21T15:00:00Z'))).toBe('21/10/2026');
  });
});

describe('aviso de mora', () => {
  const hoy = new Date(2026, 9, 21);

  it('si nunca se avisó, toca avisar', () => {
    expect(tocaAvisoDeMora(null, 7, hoy)).toBe(true);
  });

  it('toca avisar cuando pasaron al menos los días configurados desde el último aviso', () => {
    expect(tocaAvisoDeMora(new Date(2026, 9, 14), 7, hoy)).toBe(true);
    expect(tocaAvisoDeMora(new Date(2026, 9, 10), 7, hoy)).toBe(true);
  });

  it('no toca avisar antes de cumplirse los días configurados', () => {
    expect(tocaAvisoDeMora(new Date(2026, 9, 15), 7, hoy)).toBe(false);
    expect(tocaAvisoDeMora(new Date(2026, 9, 21), 7, hoy)).toBe(false);
  });

  it('una cuota entra al aviso solo cuando pasó la gracia', () => {
    expect(cuotaParaAvisoDeMora(1, 0)).toBe(true);
    expect(cuotaParaAvisoDeMora(5, 5)).toBe(false);
    expect(cuotaParaAvisoDeMora(6, 5)).toBe(true);
    expect(cuotaParaAvisoDeMora(0, 0)).toBe(false);
  });
});

describe('plantillas de correo', () => {
  const empresa = { nombreComercial: 'Empresa <Prueba>', colorPrimario: '#112233', telefonos: '3001234567', correo: 'info@prueba.test' };

  it('el correo del recibo resume el pago y escapa los textos de la base de datos', () => {
    const html = generarHtmlRecibo({
      nombreCliente: 'Ana <script>alert(1)</script>',
      numeroRecibo: 'RC-000012',
      proyecto: 'Proyecto Uno',
      lote: 'L-3',
      fechaAbono: new Date('2026-10-21T15:00:00Z'),
      valor: '500000',
      saldoNuevo: '2500000',
      empresa,
    });
    expect(html).toContain('RC-000012');
    expect(html).toContain('$500.000');
    expect(html).toContain('$2.500.000');
    expect(html).toContain('21/10/2026');
    expect(html).toContain('Empresa &lt;Prueba&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('#112233');
    expect(html).toContain('info@prueba.test');
  });

  it('el correo de mora lista las cuotas, el total y no menciona interés', () => {
    const html = generarHtmlMora({
      nombreCliente: 'Ana',
      proyecto: 'Proyecto Uno',
      lote: 'L-3',
      cuotas: [
        { etiqueta: 'Cuota 1', fechaVencimiento: new Date('2026-10-01T15:00:00Z'), saldo: '1000000' },
        { etiqueta: 'Cuota inicial', fechaVencimiento: new Date('2026-09-15T15:00:00Z'), saldo: '250000' },
      ],
      saldoVencido: '1250000',
      empresa,
    });
    expect(html).toContain('Cuota 1');
    expect(html).toContain('Cuota inicial');
    expect(html).toContain('$1.000.000');
    expect(html).toContain('$250.000');
    expect(html).toContain('Total vencido: <strong>$1.250.000</strong>');
    expect(html.toLowerCase()).not.toContain('interés');
  });

  it('un color inválido no entra al atributo style', () => {
    const html = generarHtmlRecibo({
      nombreCliente: 'Ana',
      numeroRecibo: 'RC-1',
      proyecto: 'P',
      lote: 'L',
      fechaAbono: new Date(),
      valor: '1',
      saldoNuevo: '0',
      empresa: { ...empresa, colorPrimario: 'red; background:url(x)' },
    });
    expect(html).not.toContain('background:url');
    expect(html).toContain('#2563eb');
  });
});
