import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ClientesService } from './clientes.service.js';
import { CrearClienteDto } from './dto/crear-cliente.dto.js';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  crear(@Body() dto: CrearClienteDto) {
    return this.clientesService.crear(dto);
  }

  @Get()
  listar() {
    return this.clientesService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.clientesService.buscarPorId(id);
  }
}
