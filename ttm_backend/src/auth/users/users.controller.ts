import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto, ChangePasswordDto, AdminResetPasswordDto } from './dto/user-management.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  // GET /users — list users (role-scoped)
  @Get()
  @RequirePermission('USERS', 'READ')
  findAll(@Req() req: any) {
    return this.usersService.findAll(req.user);
  }

  // GET /users/audit-logs — list activity audit logs
  @Get('audit-logs')
  @RequirePermission('USERS', 'READ')
  getAuditLogs() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // GET /users/roles — list all roles with their permissions
  @Get('roles')
  @RequirePermission('ROLES', 'READ')
  getRoles() {
    return this.prisma.role.findMany({
      include: {
        rolePermissions: { include: { permission: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // GET /users/:id — get a specific user
  @Get(':id')
  @RequirePermission('USERS', 'READ')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.usersService.findOneScoped(id, req.user);
  }

  // PATCH /users/:id — update profile (self or admin)
  @Patch(':id')
  @RequirePermission('USERS', 'UPDATE')
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: any,
  ) {
    return this.usersService.updateProfile(id, dto, req.user);
  }

  // POST /users/:id/change-password — self-service password change
  @Post(':id/change-password')
  @RequirePermission('USERS', 'UPDATE')
  changePassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: any,
  ) {
    return this.usersService.changePassword(id, dto, req.user);
  }

  // POST /users/:id/reset-password — admin resets another user's password
  @Post(':id/reset-password')
  @RequirePermission('USERS', 'MANAGE')
  adminResetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
    @Req() req: any,
  ) {
    return this.usersService.adminResetPassword(id, dto, req.user);
  }

  // PATCH /users/:id/activate — activate a user account
  @Patch(':id/activate')
  @RequirePermission('USERS', 'MANAGE')
  activate(@Param('id') id: string, @Req() req: any) {
    return this.usersService.setActiveStatus(id, true, req.user);
  }

  // PATCH /users/:id/deactivate — deactivate a user account
  @Patch(':id/deactivate')
  @RequirePermission('USERS', 'MANAGE')
  deactivate(@Param('id') id: string, @Req() req: any) {
    return this.usersService.setActiveStatus(id, false, req.user);
  }
}