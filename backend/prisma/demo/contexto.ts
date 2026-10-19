// Debe ir primero: fija la zona horaria del proceso (America/Bogota) antes de crear cualquier fecha.
import '../../src/common/zona-horaria.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type { Prisma } from '../../src/generated/prisma/client.js';
import type { MedioPago } from '../../src/generated/prisma/enums.js';
import type { AbonosService } from '../../src/abonos/abonos.service.js';
import type { UsuarioAutenticado } from '../../src/auth/usuario-autenticado.js';
import type { CarteraService } from '../../src/cartera/cartera.service.js';
import type { CierresCajaService } from '../../src/cierres-caja/cierres-caja.service.js';
import type { ClientesService } from '../../src/clientes/clientes.service.js';
import type { ConfiguracionService } from '../../src/configuracion/configuracion.service.js';
import type { EquiposService } from '../../src/equipos/equipos.service.js';
import type { FinanzasService } from '../../src/finanzas/finanzas.service.js';
import type { LotesService } from '../../src/lotes/lotes.service.js';
import type { NominaService } from '../../src/nomina/nomina.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import type { ProyectosService } from '../../src/proyectos/proyectos.service.js';
import type { TrabajadoresService } from '../../src/trabajadores/trabajadores.service.js';
import type { UsuariosService } from '../../src/usuarios/usuarios.service.js';
import type { VentasService } from '../../src/ventas/ventas.service.js';

// Los servicios REALES del sistema, con los que se arman los datos de demostración: así los recibos, los saldos, la
// auditoría y los cierres salen exactamente como en el uso diario (no son inserciones directas en la base).
export interface Contexto {
  app: INestApplicationContext;
  prisma: PrismaService;
  configuracion: ConfiguracionService;
  proyectos: ProyectosService;
  lotes: LotesService;
  clientes: ClientesService;
  ventas: VentasService;
  abonos: AbonosService;
  finanzas: FinanzasService;
  equipos: EquiposService;
  trabajadores: TrabajadoresService;
  nomina: NominaService;
  cierres: CierresCajaService;
  usuarios: UsuariosService;
  cartera: CarteraService;
  // Abono con recibo HISTÓRICO (serie H-), como los que entran al importar un Excel.
  abonoHistorico: (datos: {
    ventaId: string;
    fecha: string;
    valor: Prisma.Decimal;
    medioPago: MedioPago;
    cuentaDestinoId?: string | null;
    referencia?: string | null;
    usuario: UsuarioAutenticado;
  }) => Promise<void>;
}

// Abre la aplicación (sin servidor HTTP) contra la base indicada en process.env.DATABASE_URL. Se importa todo con
// import() dinámico porque esos módulos leen las variables de entorno al cargarse.
export async function abrirContexto(): Promise<Contexto> {
  const { AppModule } = await import('../../src/app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  const obtener = async <T>(ruta: string, nombre: string): Promise<T> => {
    const modulo = (await import(ruta)) as Record<string, new (...args: never[]) => T>;
    return app.get<T>(modulo[nombre]);
  };

  const prisma = await obtener<PrismaService>('../../src/prisma/prisma.service.js', 'PrismaService');
  const configuracion = await obtener<ConfiguracionService>('../../src/configuracion/configuracion.service.js', 'ConfiguracionService');
  const { crearAbonoEnTx } = await import('../../src/abonos/crear-abono-tx.js');

  return {
    app,
    prisma,
    configuracion,
    proyectos: await obtener<ProyectosService>('../../src/proyectos/proyectos.service.js', 'ProyectosService'),
    lotes: await obtener<LotesService>('../../src/lotes/lotes.service.js', 'LotesService'),
    clientes: await obtener<ClientesService>('../../src/clientes/clientes.service.js', 'ClientesService'),
    ventas: await obtener<VentasService>('../../src/ventas/ventas.service.js', 'VentasService'),
    abonos: await obtener<AbonosService>('../../src/abonos/abonos.service.js', 'AbonosService'),
    finanzas: await obtener<FinanzasService>('../../src/finanzas/finanzas.service.js', 'FinanzasService'),
    equipos: await obtener<EquiposService>('../../src/equipos/equipos.service.js', 'EquiposService'),
    trabajadores: await obtener<TrabajadoresService>('../../src/trabajadores/trabajadores.service.js', 'TrabajadoresService'),
    nomina: await obtener<NominaService>('../../src/nomina/nomina.service.js', 'NominaService'),
    cierres: await obtener<CierresCajaService>('../../src/cierres-caja/cierres-caja.service.js', 'CierresCajaService'),
    usuarios: await obtener<UsuariosService>('../../src/usuarios/usuarios.service.js', 'UsuariosService'),
    cartera: await obtener<CarteraService>('../../src/cartera/cartera.service.js', 'CarteraService'),
    abonoHistorico: async ({ ventaId, fecha, valor, medioPago, cuentaDestinoId, referencia, usuario }) => {
      const contexto = { ...(await configuracion.contextoRecibo(usuario)), recibidoPor: 'Registro histórico (demostración)' };
      const [anio, mes, dia] = fecha.split('-').map(Number);
      await prisma.$transaction((tx) =>
        crearAbonoEnTx(
          tx,
          { ventaId, fecha: new Date(anio, mes - 1, dia), valor, medioPago, cuentaDestinoId, referencia, registradoPorId: usuario.id, esHistorico: true },
          contexto,
        ),
      );
    },
  };
}

// El usuario con sus permisos, tal como lo ve el sistema al iniciar sesión (los servicios lo piden como "actor").
export async function actorDe(prisma: PrismaService, email: string): Promise<UsuarioAutenticado> {
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email }, include: { rol: true } });
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: { id: usuario.rol.id, clave: usuario.rol.clave, nombre: usuario.rol.nombre },
    permisos: usuario.rol.permisos,
    proyectoIds: null,
  };
}
