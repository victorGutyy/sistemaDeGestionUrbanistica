import { describe, expect, it } from 'vitest';
import { detectarTipoDocumento } from './tipo-archivo.js';

describe('detectarTipoDocumento', () => {
  it('reconoce PDF, PNG y JPG por sus primeros bytes', () => {
    expect(detectarTipoDocumento(Buffer.from('%PDF-1.4\n...'))).toBe('pdf');
    expect(detectarTipoDocumento(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('png');
    expect(detectarTipoDocumento(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpg');
  });

  it('rechaza lo demás aunque el nombre diga lo contrario: scripts, HTML, SVG, ejecutables o archivos vacíos', () => {
    expect(detectarTipoDocumento(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectarTipoDocumento(Buffer.from('<html></html>'))).toBeNull();
    expect(detectarTipoDocumento(Buffer.from('<svg onload="x()"></svg>'))).toBeNull();
    expect(detectarTipoDocumento(Buffer.from('MZ\u0090\u0000'))).toBeNull();
    expect(detectarTipoDocumento(Buffer.alloc(0))).toBeNull();
  });
});
