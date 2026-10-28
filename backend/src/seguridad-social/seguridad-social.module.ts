import { Module } from '@nestjs/common';
import { SeguridadSocialController } from './seguridad-social.controller.js';
import { SeguridadSocialService } from './seguridad-social.service.js';

@Module({
  controllers: [SeguridadSocialController],
  providers: [SeguridadSocialService],
  exports: [SeguridadSocialService],
})
export class SeguridadSocialModule {}
