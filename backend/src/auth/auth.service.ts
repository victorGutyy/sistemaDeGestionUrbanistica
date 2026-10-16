import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { EstadoUsuario } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
      include: { rol: true, proyectosPermitidos: { select: { proyectoId: true } } },
    });

    // Mismo mensaje si el correo no existe, si la cuenta está inactiva o si la
    // contraseña no coincide, para no revelar cuáles correos están registrados.
    if (!usuario || usuario.estado === EstadoUsuario.INACTIVO || !usuario.rol.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Cuenta bloqueada: ni siquiera se mira la contraseña, así un atacante no
    // puede seguir probando claves (ni confirmar que acertó una).
    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > Date.now()) {
      const minutos = Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const passwordValida = await bcrypt.compare(dto.password, usuario.passwordHash);
    if (!passwordValida) {
      await this.registrarIntentoFallido(usuario.id);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoIngreso: new Date() },
    });

    return {
      accessToken: await this.jwtService.signAsync({ sub: usuario.id }),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: { id: usuario.rol.id, clave: usuario.rol.clave, nombre: usuario.rol.nombre },
        permisos: usuario.rol.permisos,
        proyectoIds: usuario.todosLosProyectos ? null : usuario.proyectosPermitidos.map((p) => p.proyectoId),
      },
    };
  }

  // El contador se incrementa en la base (no leyendo y escribiendo desde aquí)
  // para que dos intentos simultáneos no se pisen. Al llegar al máximo se
  // bloquea la cuenta y el contador vuelve a cero.
  private async registrarIntentoFallido(usuarioId: string) {
    const [{ intentosMaximosLogin, minutosBloqueoLogin }, actualizado] = await Promise.all([
      this.configuracion.obtenerEmpresa(),
      this.prisma.usuario.update({
        where: { id: usuarioId },
        data: { intentosFallidos: { increment: 1 } },
        select: { intentosFallidos: true },
      }),
    ]);

    if (actualizado.intentosFallidos >= intentosMaximosLogin) {
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + minutosBloqueoLogin * 60_000) },
      });
    }
  }
}
