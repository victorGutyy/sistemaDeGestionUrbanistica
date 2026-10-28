import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoTrabajador, TipoDocumentoTrabajador, TipoEntidadSS } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { auxilioTransporteAplica, auxilioTransporteDe } from '../seguridad-social/calculos.js';
import { calcularAlertas } from './alertas-sst.js';
import { ActualizarTrabajadorDto, AutorizacionSaludDto, RetirarTrabajadorDto } from './dto/actualizar-trabajador.dto.js';
import { CrearTrabajadorDto } from './dto/crear-trabajador.dto.js';
import { tiposDocumentoVisibles } from './documentos-visibles.js';

const CAMPOS_AUDITADOS = [
  'nombre',
  'nombres',
  'apellidos',
  'tipoDocumento',
  'fechaNacimiento',
  'sexo',
  'area',
  'cargo',
  'tipoContrato',
  'salarioBase',
  'fechaIngreso',
  'telefono',
  'celular',
  'email',
] as const;

const ETIQUETA_CAMPO: Record<(typeof CAMPOS_AUDITADOS)[number], string> = {
  nombre: 'nombre',
  nombres: 'nombres',
  apellidos: 'apellidos',
  tipoDocumento: 'tipo de documento',
  fechaNacimiento: 'fecha de nacimiento',
  sexo: 'sexo',
  area: 'área',
  cargo: 'cargo',
  tipoContrato: 'tipo de contrato',
  salarioBase: 'salario base',
  fechaIngreso: 'fecha de ingreso',
  telefono: 'teléfono',
  celular: 'celular',
  email: 'correo',
};

// Lo que se puede entregar de un trabajador a quien NO ve salarios ni pagos (el contratista SST).
export const CAMPOS_BASICOS = {
  id: true,
  nombre: true,
  nombres: true,
  apellidos: true,
  documento: true,
  tipoDocumento: true,
  fechaNacimiento: true,
  sexo: true,
  area: true,
  cargo: true,
  tipoContrato: true,
  fechaIngreso: true,
  fechaRetiro: true,
  motivoRetiro: true,
  telefono: true,
  celular: true,
  email: true,
  estado: true,
  autorizaDatosSalud: true,
  fechaAutorizacionSalud: true,
  autorizacionSaludRegistradaPor: { select: { nombre: true } },
} satisfies Prisma.TrabajadorSelect;

export const INCLUIR_AFILIACION = {
  entidad: { select: { id: true, nombre: true, tipo: true } },
  claseRiesgo: { select: { id: true, clase: true, tasa: true } },
  registradaPor: { select: { nombre: true } },
} satisfies Prisma.AfiliacionTrabajadorInclude;

// En nombres, apellidos, área, teléfono, celular y correo, un texto vacío borra el dato.
const textoOpcional = (valor: string | undefined) => (valor === undefined ? undefined : valor.trim() === '' ? null : valor.trim());

export function componerNombre(nombres: string | null | undefined, apellidos: string | null | undefined): string {
  return [nombres, apellidos]
    .map((parte) => parte?.trim())
    .filter(Boolean)
    .join(' ');
}

const claveFecha = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

// Los datos de salud se tratan con autorización del trabajador (Ley 1581 de 2012, RNF-LEG-03): al darla queda la fecha
// y quién la registró; al retirarla se borran ambas (el cambio queda en la auditoría con los valores anteriores).
export function datosDeAutorizacionSalud(autoriza: boolean, usuario: { id: string }) {
  return autoriza
    ? { autorizaDatosSalud: true, fechaAutorizacionSalud: new Date(), autorizacionSaludRegistradaPorId: usuario.id }
    : { autorizaDatosSalud: false, fechaAutorizacionSalud: null, autorizacionSaludRegistradaPorId: null };
}

@Injectable()
export class TrabajadoresService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearTrabajadorDto, usuario: UsuarioAutenticado) {
    const existente = await this.prisma.trabajador.findUnique({ where: { documento: dto.documento } });
    if (existente) {
      throw new ConflictException(`Ya existe un trabajador con el documento ${dto.documento}`);
    }

    const nombres = textoOpcional(dto.nombres);
    const apellidos = textoOpcional(dto.apellidos);
    const nombre = dto.nombre?.trim() || componerNombre(nombres, apellidos);
    if (nombre.length < 3) {
      throw new BadRequestException('Indica el nombre del trabajador (o sus nombres y apellidos)');
    }
    const fechaNacimiento = dto.fechaNacimiento ? this.exigirNacimientoValido(dto.fechaNacimiento) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const trabajador = await tx.trabajador.create({
        data: {
          nombre,
          nombres,
          apellidos,
          documento: dto.documento,
          tipoDocumento: dto.tipoDocumento,
          fechaNacimiento,
          sexo: dto.sexo,
          area: textoOpcional(dto.area),
          cargo: dto.cargo,
          tipoContrato: dto.tipoContrato,
          salarioBase: dto.salarioBase,
          fechaIngreso: parsearFechaLocal(dto.fechaIngreso),
          telefono: textoOpcional(dto.telefono),
          celular: textoOpcional(dto.celular),
          email: textoOpcional(dto.email),
        },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TRABAJADOR_CREAR',
        entidad: 'TRABAJADOR',
        entidadId: trabajador.id,
        resumen: `Creó al trabajador ${trabajador.nombre} (${trabajador.cargo})`,
        despues: soloCampos(trabajador, ['nombre', 'documento', 'tipoDocumento', 'cargo', 'tipoContrato', 'salarioBase', 'fechaIngreso', 'estado']),
      });
      return trabajador;
    });
  }

  // Edición de la ficha (RF-PER-17). El documento no se edita. Solo lo que cambia queda en la auditoría, con su valor anterior.
  async actualizar(id: string, dto: ActualizarTrabajadorDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarSimple(id);

    const cambios: Prisma.TrabajadorUncheckedUpdateInput = {};
    const nuevoNombres = dto.nombres === undefined ? undefined : textoOpcional(dto.nombres);
    const nuevoApellidos = dto.apellidos === undefined ? undefined : textoOpcional(dto.apellidos);
    if (nuevoNombres !== undefined && nuevoNombres !== actual.nombres) cambios.nombres = nuevoNombres;
    if (nuevoApellidos !== undefined && nuevoApellidos !== actual.apellidos) cambios.apellidos = nuevoApellidos;

    // El nombre completo lo escribe la persona; si solo cambia nombres o apellidos, se vuelve a armar con ambos.
    if (dto.nombre !== undefined) {
      if (dto.nombre.trim() !== actual.nombre) cambios.nombre = dto.nombre.trim();
    } else if (cambios.nombres !== undefined || cambios.apellidos !== undefined) {
      const recompuesto = componerNombre(nuevoNombres === undefined ? actual.nombres : nuevoNombres, nuevoApellidos === undefined ? actual.apellidos : nuevoApellidos);
      if (recompuesto.length >= 3 && recompuesto !== actual.nombre) cambios.nombre = recompuesto;
    }

    if (dto.tipoDocumento !== undefined && dto.tipoDocumento !== actual.tipoDocumento) cambios.tipoDocumento = dto.tipoDocumento;
    if (dto.sexo !== undefined && dto.sexo !== actual.sexo) cambios.sexo = dto.sexo;
    if (dto.cargo !== undefined && dto.cargo.trim() !== actual.cargo) cambios.cargo = dto.cargo.trim();
    if (dto.tipoContrato !== undefined && dto.tipoContrato !== actual.tipoContrato) cambios.tipoContrato = dto.tipoContrato;
    for (const campo of ['area', 'telefono', 'celular', 'email'] as const) {
      const nuevo = textoOpcional(dto[campo]);
      if (nuevo !== undefined && nuevo !== actual[campo]) cambios[campo] = nuevo;
    }
    if (dto.salarioBase !== undefined && !new Prisma.Decimal(dto.salarioBase).equals(actual.salarioBase)) {
      cambios.salarioBase = new Prisma.Decimal(dto.salarioBase);
    }
    if (dto.fechaIngreso !== undefined && dto.fechaIngreso !== claveFecha(actual.fechaIngreso)) {
      const fechaIngreso = parsearFechaLocal(dto.fechaIngreso);
      if (actual.fechaRetiro && fechaIngreso.getTime() > actual.fechaRetiro.getTime()) {
        throw new BadRequestException('La fecha de ingreso no puede ser posterior a la de retiro');
      }
      cambios.fechaIngreso = fechaIngreso;
    }
    if (dto.fechaNacimiento !== undefined && (actual.fechaNacimiento === null || dto.fechaNacimiento !== claveFecha(actual.fechaNacimiento))) {
      cambios.fechaNacimiento = this.exigirNacimientoValido(dto.fechaNacimiento);
    }

    if (Object.keys(cambios).length === 0) {
      return actual;
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.trabajador.update({ where: { id }, data: cambios });
      const cambiados = CAMPOS_AUDITADOS.filter((campo) => (campo in cambios));
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TRABAJADOR_EDITAR',
        entidad: 'TRABAJADOR',
        entidadId: id,
        resumen: `Editó al trabajador ${actualizado.nombre} (documento ${actualizado.documento}): ${cambiados.map((campo) => ETIQUETA_CAMPO[campo]).join(', ')}`,
        antes: soloCampos(actual, cambiados),
        despues: soloCampos(actualizado, cambiados),
      });
      return actualizado;
    });
  }

  // El retiro no borra al trabajador: queda inactivo con la fecha y el motivo (RF-PER-17). Su historia se conserva.
  async retirar(id: string, dto: RetirarTrabajadorDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarSimple(id);
    if (actual.estado === EstadoTrabajador.INACTIVO) {
      throw new ConflictException('El trabajador ya está retirado');
    }
    const fechaRetiro = parsearFechaLocal(dto.fechaRetiro);
    if (fechaRetiro.getTime() < actual.fechaIngreso.getTime()) {
      throw new BadRequestException('La fecha de retiro no puede ser anterior a la de ingreso');
    }
    return this.prisma.$transaction(async (tx) => {
      const retirado = await tx.trabajador.update({
        where: { id },
        data: { estado: EstadoTrabajador.INACTIVO, fechaRetiro, motivoRetiro: dto.motivo.trim() },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TRABAJADOR_RETIRAR',
        entidad: 'TRABAJADOR',
        entidadId: id,
        resumen: `Retiró al trabajador ${retirado.nombre}: ${retirado.motivoRetiro}`,
        antes: soloCampos(actual, ['estado', 'fechaRetiro', 'motivoRetiro']),
        despues: soloCampos(retirado, ['estado', 'fechaRetiro', 'motivoRetiro']),
      });
      return retirado;
    });
  }

  async reactivar(id: string, usuario: UsuarioAutenticado) {
    const actual = await this.buscarSimple(id);
    if (actual.estado === EstadoTrabajador.ACTIVO) {
      throw new ConflictException('El trabajador ya está activo');
    }
    return this.prisma.$transaction(async (tx) => {
      const reactivado = await tx.trabajador.update({ where: { id }, data: { estado: EstadoTrabajador.ACTIVO, fechaRetiro: null, motivoRetiro: null } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TRABAJADOR_REACTIVAR',
        entidad: 'TRABAJADOR',
        entidadId: id,
        resumen: `Reactivó al trabajador ${reactivado.nombre}`,
        antes: soloCampos(actual, ['estado', 'fechaRetiro', 'motivoRetiro']),
        despues: soloCampos(reactivado, ['estado', 'fechaRetiro', 'motivoRetiro']),
      });
      return reactivado;
    });
  }

  // Autorización del trabajador para tratar sus datos de salud (RNF-LEG-03). Mismo patrón que la del cliente.
  async registrarAutorizacionSalud(id: string, dto: AutorizacionSaludDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarSimple(id);
    if (actual.autorizaDatosSalud === dto.autoriza) {
      return actual;
    }
    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.trabajador.update({ where: { id }, data: datosDeAutorizacionSalud(dto.autoriza, usuario) });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TRABAJADOR_AUTORIZACION_SALUD',
        entidad: 'TRABAJADOR',
        entidadId: id,
        resumen: `${dto.autoriza ? 'Registró' : 'Retiró'} la autorización de datos de salud de ${actualizado.nombre}`,
        antes: soloCampos(actual, ['autorizaDatosSalud', 'fechaAutorizacionSalud', 'autorizacionSaludRegistradaPorId']),
        despues: soloCampos(actualizado, ['autorizaDatosSalud', 'fechaAutorizacionSalud', 'autorizacionSaludRegistradaPorId']),
      });
      return actualizado;
    });
  }

  listar() {
    return this.prisma.trabajador.findMany({ orderBy: { nombre: 'asc' } });
  }

  // Detalle completo (con salario y pagos): para quien ve la nómina.
  async buscarPorId(id: string, usuario?: UsuarioAutenticado) {
    const trabajador = await this.prisma.trabajador.findUnique({
      where: { id },
      include: {
        pagos: { include: { novedades: true }, orderBy: { fechaPago: 'desc' } },
        afiliaciones: { include: INCLUIR_AFILIACION, orderBy: [{ tipo: 'asc' }, { fechaInicio: 'desc' }] },
        documentos: {
          where: { tipo: { in: [...tiposDocumentoVisibles(usuario?.permisos ?? [])] } },
          orderBy: { createdAt: 'desc' },
          include: { subidoPor: { select: { nombre: true } } },
        },
        autorizacionSaludRegistradaPor: { select: { nombre: true } },
      },
    });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${id}`);
    }
    return { ...trabajador, legales: await this.datosLegales(trabajador.salarioBase, trabajador.afiliaciones) };
  }

  // Lista del módulo SST: sin salarios ni pagos, con las afiliaciones vigentes.
  listarSst() {
    return this.prisma.trabajador.findMany({
      orderBy: { nombre: 'asc' },
      select: { ...CAMPOS_BASICOS, afiliaciones: { where: { fechaFin: null }, include: INCLUIR_AFILIACION, orderBy: { tipo: 'asc' } } },
    });
  }

  // Ficha para el contratista SST: lo mismo que el detalle, pero sin salario, pagos ni documentos de recursos humanos.
  async fichaSst(id: string, usuario: UsuarioAutenticado) {
    const trabajador = await this.prisma.trabajador.findUnique({
      where: { id },
      select: {
        ...CAMPOS_BASICOS,
        afiliaciones: { include: INCLUIR_AFILIACION, orderBy: [{ tipo: 'asc' }, { fechaInicio: 'desc' }] },
        documentos: {
          where: { tipo: { in: [...tiposDocumentoVisibles(usuario.permisos)] } },
          orderBy: { createdAt: 'desc' },
          include: { subidoPor: { select: { nombre: true } } },
        },
      },
    });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${id}`);
    }
    return { ...trabajador, legales: await this.datosLegales(null, trabajador.afiliaciones) };
  }

  // Qué le falta a cada trabajador activo: afiliaciones, certificado y autorización de datos de salud.
  async alertasSst() {
    const filas = await this.prisma.trabajador.findMany({
      where: { estado: EstadoTrabajador.ACTIVO },
      select: {
        id: true,
        nombre: true,
        documento: true,
        estado: true,
        tipoContrato: true,
        autorizaDatosSalud: true,
        afiliaciones: { where: { fechaFin: null }, select: { tipo: true } },
        documentos: { where: { tipo: TipoDocumentoTrabajador.CERTIFICADO_AFILIACION }, select: { id: true }, take: 1 },
      },
    });
    return calcularAlertas(
      filas.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        documento: fila.documento,
        estado: fila.estado,
        tipoContrato: fila.tipoContrato,
        autorizaDatosSalud: fila.autorizaDatosSalud,
        afiliacionesVigentes: fila.afiliaciones.map((a) => a.tipo),
        tieneCertificadoAfiliacion: fila.documentos.length > 0,
      })),
    );
  }

  private async buscarSimple(id: string) {
    const trabajador = await this.prisma.trabajador.findUnique({ where: { id } });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${id}`);
    }
    return trabajador;
  }

  private exigirNacimientoValido(texto: string): Date {
    const fecha = parsearFechaLocal(texto);
    if (Number.isNaN(fecha.getTime()) || fecha.getTime() > Date.now()) {
      throw new BadRequestException('La fecha de nacimiento no es válida');
    }
    return fecha;
  }

  // Auxilio de transporte y tasa de la ARL, calculados solos (RF-PER-18) con los parámetros legales del año en curso.
  // Si ese año no tiene parámetros no se inventan: el campo queda vacío y la pantalla avisa.
  private async datosLegales(
    salarioBase: Prisma.Decimal | null,
    afiliaciones: readonly { tipo: TipoEntidadSS; fechaFin: Date | null; claseRiesgo: { clase: number; tasa: Prisma.Decimal } | null }[],
  ) {
    const anio = new Date().getFullYear();
    const parametro = await this.prisma.parametroLegal.findUnique({ where: { anio } });
    const arl = afiliaciones.find((a) => a.tipo === TipoEntidadSS.ARL && a.fechaFin === null);
    return {
      anio,
      hayParametros: parametro !== null,
      parametrosValidados: parametro?.validadoEn != null,
      auxilioTransporte:
        parametro && salarioBase ? { aplica: auxilioTransporteAplica(salarioBase, parametro), valor: auxilioTransporteDe(salarioBase, parametro) } : null,
      tasaArl: arl?.claseRiesgo ? { clase: arl.claseRiesgo.clase, tasa: arl.claseRiesgo.tasa } : null,
    };
  }
}
