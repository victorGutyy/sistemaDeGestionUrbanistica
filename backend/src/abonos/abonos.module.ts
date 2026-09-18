import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { AbonosController } from './abonos.controller.js';
import { AbonosService } from './abonos.service.js';

@Module({
  imports: [StorageModule],
  controllers: [AbonosController],
  providers: [AbonosService],
})
export class AbonosModule {}
