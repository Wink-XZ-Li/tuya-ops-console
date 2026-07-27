import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CommandsService } from './commands.service';
import { ListCommandsDto } from './dto/list-commands.dto';
import { SendCommandDto } from './dto/send-command.dto';

@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CommandsController {
  constructor(private readonly commandsService: CommandsService) {}

  @Get('devices/:deviceId/functions')
  @Roles('readonly', 'operator', 'admin')
  getFunctions(@Param('deviceId') deviceId: string) {
    return this.commandsService.getFunctions(deviceId);
  }

  @Post('devices/:deviceId/commands')
  @Roles('operator', 'admin')
  send(
    @Param('deviceId') deviceId: string,
    @Body() dto: SendCommandDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.commandsService.send(deviceId, req.user.id, dto);
  }

  @Get('commands')
  @Roles('readonly', 'operator', 'admin')
  list(@Query() query: ListCommandsDto) {
    return this.commandsService.list(query);
  }
}
