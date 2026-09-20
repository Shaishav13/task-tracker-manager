import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Put, Req } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SyncPermissionsDto } from './dto/sync-permissions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @RequirePermission('ROLES', 'READ')
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Get()
  @RequirePermission('ROLES', 'READ')
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermission('ROLES', 'READ')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermission('ROLES', 'MANAGE')
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Patch(':id')
  @RequirePermission('ROLES', 'MANAGE')
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @RequirePermission('ROLES', 'MANAGE')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }

  @Put(':id/permissions')
  @RequirePermission('ROLES', 'MANAGE')
  syncPermissions(@Param('id') id: string, @Body() syncPermissionsDto: SyncPermissionsDto, @Req() req: any) {
    return this.rolesService.syncPermissions(id, syncPermissionsDto.permissionIds, req.user);
  }
}

