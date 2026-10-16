import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { escaparHtml, generarHtmlRecordatorio, type DatosRecordatorio } from './plantilla-correo.js';

const EMPRESA = { nombreComercial: 'Empresa de Prueba', colorPrimario: '#0f766e', telefonos: '300 000 0000', correo: null };

function datos(sobrescribir: Partial<DatosRecordatorio> = {}): DatosRecordatorio {
  return {
    nombreCliente: 'Ana Pérez',
    nombreProyecto: 'Proyecto Test',
    numeroLote: 'L-1',
    numeroCuota: 3,
    fechaVencimiento: new Date(2026, 10, 19),
    valor: new Prisma.Decimal('1234567'),
    empresa: EMPRESA,
    ...sobrescribir,
  };
}

describe('escaparHtml', () => {
  it('convierte los caracteres que alteran el HTML', () => {
    expect(escaparHtml(`<b onclick="x">&'`)).toBe('&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('generarHtmlRecordatorio', () => {
  it('muestra el nombre de la empresa, su color, su contacto y el valor en pesos colombianos', () => {
    const html = generarHtmlRecordatorio(datos());

    expect(html).toContain('Empresa de Prueba');
    expect(html).toContain('#0f766e');
    expect(html).toContain('300 000 0000');
    expect(html).toContain('$1.234.567');
    expect(html).toContain('19 de noviembre de 2026');
  });

  it('no deja pasar HTML escrito en el nombre del cliente ni en el de la empresa', () => {
    const html = generarHtmlRecordatorio(
      datos({
        nombreCliente: '<script>alert(1)</script>',
        empresa: { ...EMPRESA, nombreComercial: '<img src=x onerror=alert(1)>' },
      }),
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('ignora un color que no sea #rrggbb para no meter texto raro en el atributo style', () => {
    const html = generarHtmlRecordatorio(datos({ empresa: { ...EMPRESA, colorPrimario: 'red;background:url(x)' } }));

    expect(html).not.toContain('background:url');
    expect(html).toContain('#2563eb');
  });
});

describe('etiqueta de la cuota en el recordatorio', () => {
  it('una cuota normal se nombra por su número', () => {
    expect(generarHtmlRecordatorio(datos({ numeroCuota: 3 }))).toContain('la cuota <strong>#3</strong>');
  });

  it('la cuota 0 se nombra como cuota inicial, no como "cuota #0"', () => {
    const html = generarHtmlRecordatorio(datos({ numeroCuota: 0 }));
    expect(html).toContain('la <strong>cuota inicial</strong>');
    expect(html).not.toContain('<strong>#0</strong>');
  });
});
