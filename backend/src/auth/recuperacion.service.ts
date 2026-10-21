import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { EmailService } from '../email/email.service.js';
import { EstadoUsuario } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generarHtmlCambioDePassword, generarHtmlRecuperacion } from './plantillas-recuperacion.js';
import { enlaceDeRecuperacion, generarToken, huellaDeToken } from './recuperacion-token.js';

const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_MINUTO = 60 * 1000;

// Mismo mensaje para un enlace inventado, vencido, ya usado o de una cuenta desactivada: quien lo intenta no aprende
// nada de cuál fue el problema.
const MENSAJE_ENLACE_INVALIDO = 'El enlace no es válido o ya venció. Pide uno nuevo desde la pantalla de ingreso.';

// Recuperación de contraseña por correo (RF-USR-06). La solicitud responde siempre igual, exista o no la cuenta (así
// nadie averigua qué correos están registrados), y el enlace sirve una sola vez.
@Injectable()
export class RecuperacionService {
  private readonly logger = new Logger(RecuperacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async solicitar(correo: string): Promise<void> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { email: { equals: correo.trim(), mode: 'insensitive' } },
      include: { rol: { select: { activo: true } } },
    });
    // Sin cuenta, cuenta desactivada o rol desactivado: no se hace nada (y la respuesta al usuario es la misma).
    if (!usuario || usuario.estado === EstadoUsuario.INACTIVO || !usuario.rol.activo) return;

    const empresa = await this.configuracion.obtenerEmpresa();
    const ahora = Date.now();

    // Tope por hora y cuenta: evita que alguien le llene el correo a otra persona pidiendo enlaces.
    const recientes = await this.prisma.recuperacionPassword.count({
      where: { usuarioId: usuario.id, createdAt: { gte: new Date(ahora - MS_POR_HORA) } },
    });
    if (recientes >= empresa.recuperacionesPorHora) return;

    const { token, huella } = generarToken();
    await this.prisma.recuperacionPassword.create({
      data: { usuarioId: usuario.id, tokenHash: huella, venceEn: new Date(ahora + empresa.minutosVigenciaRecuperacion * MS_POR_MINUTO) },
    });

    const enlace = enlaceDeRecuperacion(process.env.FRONTEND_URL ?? 'http://localhost:5173', token);
    if (!this.email.estaConfigurado()) {
      // Solo para poder probar sin servidor de correo. En producción nunca se escribe el enlace en el registro.
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('No se pudo enviar el enlace de recuperación: el correo de la empresa no está configurado');
      } else {
        this.logger.warn(`Correo sin configurar (solo desarrollo). Enlace de recuperación de ${usuario.email}: ${enlace}`);
      }
      return;
    }

    try {
      await this.email.enviar({
        to: usuario.email,
        subject: `Recupera tu contraseña — ${empresa.nombreComercial}`,
        html: generarHtmlRecuperacion({
          nombre: usuario.nombre,
          enlace,
          minutosVigencia: empresa.minutosVigenciaRecuperacion,
          empresa: this.datosEmpresa(empresa),
        }),
      });
    } catch (error) {
      this.logger.error(`No se pudo enviar el enlace de recuperación a ${usuario.email}: ${String(error)}`);
    }
  }

  async restablecer(token: string, password: string): Promise<void> {
    const fila = await this.prisma.recuperacionPassword.findUnique({
      where: { tokenHash: huellaDeToken(token) },
      include: { usuario: { include: { rol: { select: { activo: true } } } } },
    });
    const ahora = new Date();
    if (!fila || fila.usadoEn || fila.venceEn <= ahora || fila.usuario.estado === EstadoUsuario.INACTIVO || !fila.usuario.rol.activo) {
      throw new BadRequestException(MENSAJE_ENLACE_INVALIDO);
    }

    const usuario = fila.usuario;
    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.$transaction(async (tx) => {
      // El uso se marca en la misma escritura que lo comprueba: si dos personas abren el mismo enlace a la vez, solo
      // una lo gana y la otra recibe el mensaje de enlace inválido.
      const marcado = await tx.recuperacionPassword.updateMany({
        where: { id: fila.id, usadoEn: null, venceEn: { gt: ahora } },
        data: { usadoEn: ahora },
      });
      if (marcado.count === 0) {
        throw new BadRequestException(MENSAJE_ENLACE_INVALIDO);
      }
      // Los demás enlaces pendientes de esa cuenta dejan de servir.
      await tx.recuperacionPassword.updateMany({ where: { usuarioId: usuario.id, usadoEn: null }, data: { usadoEn: ahora } });

      await tx.usuario.update({
        where: { id: usuario.id },
        // Cierra las sesiones abiertas y desbloquea la cuenta, igual que cuando lo hace el gerente.
        data: { passwordHash, intentosFallidos: 0, bloqueadoHasta: null, sesionesValidasDesde: ahora },
      });
      // La contraseña nunca se guarda en la auditoría: solo que se cambió.
      await registrarAuditoria(tx, {
        usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email },
        accion: 'USUARIO_RECUPERAR_PASSWORD',
        entidad: 'USUARIO',
        entidadId: usuario.id,
        resumen: `${usuario.nombre} (${usuario.email}) recuperó su contraseña con el enlace del correo y se cerraron sus sesiones abiertas`,
        despues: { contrasenaCambiada: true, sesionesCerradas: true, desbloqueado: true },
      });
    });

    // Aviso al dueño de la cuenta; si el correo falla, el cambio ya está hecho.
    if (this.email.estaConfigurado()) {
      try {
        const empresa = await this.configuracion.obtenerEmpresa();
        await this.email.enviar({
          to: usuario.email,
          subject: `Tu contraseña cambió — ${empresa.nombreComercial}`,
          html: generarHtmlCambioDePassword({ nombre: usuario.nombre, empresa: this.datosEmpresa(empresa) }),
        });
      } catch (error) {
        this.logger.warn(`No se pudo avisar a ${usuario.email} del cambio de contraseña: ${String(error)}`);
      }
    }
  }

  private datosEmpresa(empresa: { nombreComercial: string; colorPrimario: string; telefonos: string | null; correo: string | null }) {
    return { nombreComercial: empresa.nombreComercial, colorPrimario: empresa.colorPrimario, telefonos: empresa.telefonos, correo: empresa.correo };
  }
}
