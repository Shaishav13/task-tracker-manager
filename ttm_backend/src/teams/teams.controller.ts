import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@Controller('teams')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @RequirePermission('TEAMS', 'CREATE')
  create(@Body() createTeamDto: CreateTeamDto, @Req() req: any) {
    return this.teamsService.create(createTeamDto, req.user);
  }

  @Get()
  @RequirePermission('TEAMS', 'READ')
  findAll(@Req() req: any) {
    return this.teamsService.findAll(req.user);
  }

  @Get(':id')
  @RequirePermission('TEAMS', 'READ')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.teamsService.findOne(id, req.user);
  }

  @Patch(':id')
  @RequirePermission('TEAMS', 'UPDATE')
  update(@Param('id') id: string, @Body() updateTeamDto: UpdateTeamDto, @Req() req: any) {
    return this.teamsService.update(id, updateTeamDto, req.user);
  }

  @Delete(':id')
  @RequirePermission('TEAMS', 'DELETE')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.teamsService.remove(id, req.user);
  }
}
