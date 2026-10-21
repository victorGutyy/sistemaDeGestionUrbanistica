import { BadGatewayException, ConflictException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { EmailService, direccionDeRespuesta } from './email.service.js';
import { generarHtmlPrueba } from './plantilla-prueba.js';

const MAX_DETALLE = 300;
// Mínimo entre dos pruebas de la misma persona: evita que el botón se use para llenar de correos a alguien.
const ESPERA_ENTRE_PRUEBAS_MS = 10_000;

export interface EstadoCorreo {
  configurado: boolean;
  // Desde qué dirección salen los avisos (null si el servidor no tiene correo configurado).
  remitente: string | null;
  // A dónde llegan las respuestas de los clientes (null si no hay un correo de la empresa distinto del remitente).
  respondeA: string | null;
}

// Estado del correo de la empresa y el envío de un mensaje de prueba, para que el gerente compruebe que los avisos a
// los clientes van a salir antes de depender de ellos.
@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);
  private readonly ultimaPrueba = new Map<string, number>();

  constructor(
    private readonly email: EmailService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async estado(): Promise<EstadoCorreo> {
    const empresa = await this.configuracion.obtenerEmpresa();
    const configurado = this.email.estaConfigurado();
    const remitente = configurado ? this.email.remitente() : null;
    return { configurado, remitente, respondeA: remitente ? direccionDeRespuesta(empresa.correo, remitente) ?? null : null };
  }

  async enviarPrueba(destino: string, usuario: UsuarioAutenticado) {
    if (!this.email.estaConfigurado()) {
      throw new ConflictException('El correo no está configurado en el servidor: faltan los datos SMTP (servidor, usuario o contraseña) en la configuración de despliegue.');
    }

    const ahora = Date.now();
    const anterior = this.ultimaPrueba.get(usuario.id);
    if (anterior && ahora - anterior < ESPERA_ENTRE_PRUEBAS_MS) {
      throw new HttpException('Espera unos segundos antes de enviar otra prueba.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.ultimaPrueba.set(usuario.id, ahora);

    const empresa = await this.configuracion.obtenerEmpresa();
    const remitente = this.email.remitente();
    const respondeA = direccionDeRespuesta(empresa.correo, remitente) ?? null;

    try {
      await this.email.enviar({
        to: destino,
        subject: `Correo de prueba — ${empresa.nombreComercial}`,
        html: generarHtmlPrueba({
          enviadoPor: usuario.nombre,
          remitente,
          respondeA,
          empresa: { nombreComercial: empresa.nombreComercial, colorPrimario: empresa.colorPrimario, telefonos: empresa.telefonos, correo: empresa.correo },
        }),
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Falló el correo de prueba a ${destino}: ${mensaje}`);
      throw new BadGatewayException(`El servidor de correo rechazó el envío: ${mensaje.slice(0, MAX_DETALLE)}`);
    }

    return { enviado: true as const, remitente, destino, respondeA };
  }
}
