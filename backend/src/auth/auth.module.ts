import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { EmailModule } from '../email/email.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JWT_SECRET } from './jwt-secret.js';
import { JwtStrategy } from './jwt.strategy.js';
import { RecuperacionService } from './recuperacion.service.js';

@Module({
  imports: [
    PassportModule,
    ConfiguracionModule,
    EmailModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' } as JwtModuleOptions['signOptions'],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RecuperacionService, JwtStrategy],
})
export class AuthModule {}
