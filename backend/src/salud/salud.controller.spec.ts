import { ServiceUnavailableException } from '@nestjs/common';
import { SaludController } from './salud.controller.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function controladorConBase(respuesta: () => Promise<unknown>) {
  const consulta = vi.fn(respuesta);
  const prisma = { $queryRaw: consulta } as unknown as PrismaService;
  return { controlador: new SaludController(prisma), consulta };
}

describe('SaludController', () => {
  it('responde ok cuando la base de datos contesta', async () => {
    const { controlador, consulta } = controladorConBase(async () => [{ '?column?': 1 }]);

    await expect(controlador.comprobar()).resolves.toEqual({ estado: 'ok' });
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it('responde 503 sin revelar el error cuando la base de datos no contesta', async () => {
    const { controlador } = controladorConBase(async () => {
      throw new Error('password authentication failed for user "balder" at 10.0.0.5');
    });

    const error = await controlador.comprobar().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toContain('password');
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toContain('10.0.0.5');
  });
});
