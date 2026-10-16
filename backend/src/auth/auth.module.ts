import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JWT_SECRET } from './jwt-secret.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    PassportModule,
    ConfiguracionModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' } as JwtModuleOptions['signOptions'],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
