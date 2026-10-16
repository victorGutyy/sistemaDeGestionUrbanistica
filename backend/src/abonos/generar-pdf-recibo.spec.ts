import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { generarPdfRecibo } from './generar-pdf-recibo.js';
import { construirContenidoRecibo, type ContenidoRecibo } from './recibo-contenido.js';

const D = (v: string) => new Prisma.Decimal(v);

function contenidoDePrueba(sobrescribir: Partial<ContenidoRecibo> = {}): ContenidoRecibo {
  return {
    ...construirContenidoRecibo({
      numeroTexto: 'RC-000001',
      esHistorico: false,
      fechaEmision: new Date(2026, 1, 3, 10, 30),
      empresa: {
        nombreComercial: 'Empresa de prueba',
        razonSocial: 'Empresa de prueba SAS',
        nit: '900000000',
        direccion: 'Calle 1 # 2-3',
        telefonos: '3000000000',
        correo: 'contacto@ejemplo.test',
        logoRuta: null,
        colorPrimario: '#2563eb',
        textoLegal: 'Este recibo no constituye escritura ni promesa de compraventa.',
      },
      cliente: { nombre: 'Cliente de Prueba', documento: '1000000001' },
      proyecto: 'Proyecto de prueba',
      manzana: 'Manzana A',
      lote: 'L-1',
      fechaAbono: new Date(2026, 1, 3),
      valor: D('7000000'),
      medioPago: 'TRANSFERENCIA',
      cuenta: { banco: 'Banco de prueba', alias: 'Ahorros', numero: '123456' },
      referencia: 'REF-123',
      conSoporte: true,
      cuotasCubiertas: [
        { numero: 1, valor: D('5000000'), completa: true },
        { numero: 2, valor: D('2000000'), completa: false },
      ],
      saldoAnterior: D('15000000'),
      saldoNuevo: D('8000000'),
      recibidoPor: 'Usuario Prueba',
    }),
    ...sobrescribir,
  };
}

describe('generarPdfRecibo (RF-REC-04)', () => {
  it('genera un PDF válido a partir de la fotografía del recibo', async () => {
    const pdf = await generarPdfRecibo(contenidoDePrueba());
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it('también genera el recibo anulado, el histórico y el que no tiene dirección ni soporte', async () => {
    const anulado = await generarPdfRecibo(contenidoDePrueba(), {
      anulacion: { fecha: new Date(2026, 1, 5), motivo: 'Consignación devuelta por el banco', usuario: 'Gerente de Prueba' },
    });
    const historico = await generarPdfRecibo(contenidoDePrueba({ esHistorico: true, numeroTexto: 'H-000001' }));
    const minimo = await generarPdfRecibo(
      contenidoDePrueba({
        conSoporte: false,
        cuenta: null,
        referencia: null,
        empresa: { ...contenidoDePrueba().empresa, direccion: null, telefonos: null, correo: null, textoLegal: null },
      }),
    );

    for (const pdf of [anulado, historico, minimo]) {
      expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    }
    // La marca de anulación agrega contenido al documento.
    expect(anulado.length).toBeGreaterThan((await generarPdfRecibo(contenidoDePrueba())).length);
  });

  it('un logo que no se pueda dibujar no impide emitir el recibo', async () => {
    const pdf = await generarPdfRecibo(contenidoDePrueba(), { logo: Buffer.from('esto no es una imagen') });
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('el contenido guardado conserva el valor en letras y no cambia aunque cambien los datos de origen', () => {
    const contenido = contenidoDePrueba();
    expect(contenido.valorEnLetras).toBe('SIETE MILLONES DE PESOS M/CTE');
    expect(contenido.cuotasCubiertas.map((c) => c.etiqueta)).toEqual(['Cuota 1', 'Cuota 2']);
    expect(JSON.parse(JSON.stringify(contenido))).toEqual(contenido);
  });
});

describe('generarPdfRecibo: una sola hoja', () => {
  const paginas = (pdf: Buffer) => Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]);

  it('el recibo normal, el anulado y uno que cubre 12 cuotas caben en una hoja', async () => {
    const muchasCuotas = Array.from({ length: 12 }, (_, i) => ({ numero: i + 1, valor: D('1000000'), completa: true }));
    const grande = contenidoDePrueba({
      cuotasCubiertas: muchasCuotas.map((c) => ({ numero: c.numero, etiqueta: `Cuota ${c.numero}`, valor: c.valor.toString(), completa: c.completa })),
    });
    expect(paginas(await generarPdfRecibo(contenidoDePrueba()))).toBe(1);
    expect(
      paginas(await generarPdfRecibo(contenidoDePrueba(), { anulacion: { fecha: new Date(2026, 1, 5), motivo: 'Motivo de prueba', usuario: 'Gerente de Prueba' } })),
    ).toBe(1);
    expect(paginas(await generarPdfRecibo(grande, { anulacion: { fecha: new Date(2026, 1, 5), motivo: 'Motivo de prueba', usuario: 'Gerente de Prueba' } }))).toBe(1);
  });
});
