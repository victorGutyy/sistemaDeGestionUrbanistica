import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import { exigirAlcanceTotal, filtroCliente, filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { detectarTipoDocumento } from '../common/tipo-archivo.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, TipoDocumento } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { datosDeAutorizacion } from './autorizacion.js';
import { ActualizarClienteDto } from './dto/actualizar-cliente.dto.js';
import { CrearClienteDto } from './dto/crear-cliente.dto.js';
import { construirEstadoCuentaCliente, type EstadoCuentaCliente } from './estado-cuenta-cliente.js';
import { generarPdfEstadoCuenta } from './generar-pdf-estado-cuenta.js';

const LIMITE_LISTA = 300;

// Solo lo aplicado por abonos ACTIVOS cuenta para saldos y cuotas pagadas.
const APLICACIONES_ACTIVAS = { where: { abono: { estado: EstadoAbono.ACTIVO } }, select: { valor: true } } as const;

const CAMPOS_AUDITADOS = ['nombre', 'tipoDocumento', 'telefono', 'email', 'direccion', 'autorizaDatos', 'fechaAutorizacion'] as const;
const ETIQUETA_CAMPO: Record<(typeof CAMPOS_AUDITADOS)[number], string> = {
  nombre: 'nombre',
  tipoDocumento: 'tipo de documento',
  telefono: 'teléfono',
  email: 'correo',
  direccion: 'dirección',
  autorizaDatos: 'autorización de datos',
  fechaAutorizacion: 'fecha de autorización',
};

// En teléfono, correo y dirección un texto vacío borra el dato.
const textoOpcional = (valor: string | undefined) => (valor === undefined ? undefined : valor.trim() === '' ? null : valor.trim());

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly storage: StorageService,
  ) {}

  async crear(dto: CrearClienteDto, usuario: UsuarioAutenticado) {
    // Un cliente sin ventas todavía no pertenece a ningún proyecto: lo registra
    // quien ve todos los proyectos (o se crea junto con su venta).
    exigirAlcanceTotal(usuario);

    const existente = await this.prisma.cliente.findUnique({
      where: { documento: dto.documento },
    });
    if (existente) {
      throw new ConflictException(`Ya existe un cliente con el documento ${dto.documento}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const { autorizaDatos, ...datos } = dto;
      const cliente = await tx.cliente.create({ data: { ...datos, ...(autorizaDatos ? datosDeAutorizacion(true, usuario) : {}) } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CLIENTE_CREAR',
        entidad: 'CLIENTE',
        entidadId: cliente.id,
        resumen: `Creó el cliente ${cliente.nombre} (documento ${cliente.documento})`,
        despues: soloCampos(cliente, ['nombre', 'documento', 'tipoDocumento', 'telefono', 'email', 'direccion', 'autorizaDatos']),
      });
      return cliente;
    });
  }

  // Búsqueda por nombre, documento o teléfono. Quien tiene alcance restringido solo ve a los clientes con alguna venta
  // en sus proyectos, y el conteo de ventas también se limita a ellos.
  listar(usuario: UsuarioAutenticado, buscar?: string) {
    const texto = buscar?.trim();
    return this.prisma.cliente.findMany({
      where: {
        AND: [
          filtroCliente(usuario),
          texto
            ? {
                OR: [
                  { nombre: { contains: texto, mode: 'insensitive' } },
                  { documento: { contains: texto, mode: 'insensitive' } },
                  { telefono: { contains: texto, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      include: { _count: { select: { ventas: { where: filtroVenta(usuario) } } } },
      orderBy: { nombre: 'asc' },
      take: LIMITE_LISTA,
    });
  }

  // Datos básicos de un cliente dentro del alcance del usuario.
  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, ...filtroCliente(usuario) } });
    if (!cliente) {
      throw new NotFoundException(`No existe el cliente ${id}`);
    }
    return cliente;
  }

  // Ficha del cliente (RF-CLI-03): sus datos, el resumen de cartera y cada una de sus ventas con cuotas y abonos.
  async ficha(id: string, usuario: UsuarioAutenticado): Promise<EstadoCuentaCliente> {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id, ...filtroCliente(usuario) },
      include: {
        autorizacionRegistradaPor: { select: { nombre: true } },
        ventas: {
          // Un cliente con ventas en varios proyectos solo muestra las del alcance del usuario.
          where: filtroVenta(usuario),
          orderBy: { fechaVenta: 'desc' },
          include: {
            lote: { select: { id: true, numero: true, proyecto: { select: { nombre: true } }, manzana: { select: { nombre: true } } } },
            cuotas: { include: { aplicaciones: APLICACIONES_ACTIVAS } },
            abonos: {
              select: {
                id: true,
                fecha: true,
                valor: true,
                medioPago: true,
                estado: true,
                recibo: { select: { numeroTexto: true } },
                cuentaDestino: { select: { alias: true } },
              },
            },
          },
        },
      },
    });
    if (!cliente) {
      throw new NotFoundException(`No existe el cliente ${id}`);
    }

    const empresa = await this.configuracion.obtenerEmpresa();
    return construirEstadoCuentaCliente(cliente, {
      hoy: new Date(),
      mora: { tasaMoraMensual: empresa.tasaMoraMensual, diasGracia: empresa.diasGraciaMora },
      diasAlertaAmarilla: empresa.diasSemaforoAmarillo,
    });
  }

  // Edición de datos y de la autorización de tratamiento de datos. El documento no se edita. Solo lo que cambia queda
  // en la auditoría, con su valor anterior.
  async actualizar(id: string, dto: ActualizarClienteDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarPorId(id, usuario);

    const cambios: Prisma.ClienteUncheckedUpdateInput = {};
    if (dto.nombre !== undefined && dto.nombre.trim() !== actual.nombre) cambios.nombre = dto.nombre.trim();
    if (dto.tipoDocumento !== undefined && dto.tipoDocumento !== actual.tipoDocumento) cambios.tipoDocumento = dto.tipoDocumento as TipoDocumento;
    for (const campo of ['telefono', 'email', 'direccion'] as const) {
      const nuevo = textoOpcional(dto[campo]);
      if (nuevo !== undefined && nuevo !== actual[campo]) cambios[campo] = nuevo;
    }
    if (dto.autorizaDatos !== undefined && dto.autorizaDatos !== actual.autorizaDatos) {
      Object.assign(cambios, datosDeAutorizacion(dto.autorizaDatos, usuario));
    }
    if (Object.keys(cambios).length === 0) {
      return actual;
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.cliente.update({ where: { id }, data: cambios });
      const cambiados = CAMPOS_AUDITADOS.filter((campo) => String(actual[campo]) !== String(actualizado[campo]));
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CLIENTE_EDITAR',
        entidad: 'CLIENTE',
        entidadId: id,
        resumen: `Editó el cliente ${actualizado.nombre} (documento ${actualizado.documento}): ${cambiados.map((campo) => ETIQUETA_CAMPO[campo]).join(', ')}`,
        antes: soloCampos(actual, cambiados),
        despues: soloCampos(actualizado, cambiados),
      });
      return actualizado;
    });
  }

  // Estado de cuenta del cliente en PDF (RF-REP-03).
  async estadoCuentaPdf(id: string, usuario: UsuarioAutenticado) {
    const estado = await this.ficha(id, usuario);
    const empresa = await this.configuracion.obtenerEmpresa();

    // El logo se lee del almacenamiento; pdfkit solo dibuja PNG y JPG (un WebP se omite sin impedir el PDF).
    let logo: Buffer | undefined;
    if (empresa.logoRuta) {
      try {
        const buffer = await this.storage.leer(empresa.logoRuta);
        const tipo = detectarTipoDocumento(buffer);
        logo = tipo === 'png' || tipo === 'jpg' ? buffer : undefined;
      } catch {
        logo = undefined;
      }
    }

    const buffer = await generarPdfEstadoCuenta(estado, { empresa, logo });
    return { buffer, nombreArchivo: `estado-de-cuenta-${estado.cliente.documento}.pdf` };
  }
}
