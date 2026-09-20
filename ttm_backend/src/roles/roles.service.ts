import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });
    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }
    return role;
  }

  async create(createRoleDto: CreateRoleDto) {
    const roleNameUpper = createRoleDto.name.toUpperCase();
    const existingRole = await this.prisma.role.findUnique({
      where: { name: roleNameUpper },
    });
    if (existingRole) {
      throw new BadRequestException(`Role with name "${createRoleDto.name}" already exists`);
    }

    const { name, description, permissionIds } = createRoleDto;

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name: roleNameUpper,
          description,
          isSystem: false,
        },
      });

      if (permissionIds && permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permId) => ({
            roleId: role.id,
            permissionId: permId,
          })),
        });
      }

      return tx.role.findUnique({
        where: { id: role.id },
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      });
    });
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    const role = await this.findOne(id);

    if (role.isSystem) {
      if (updateRoleDto.name && updateRoleDto.name.toUpperCase() !== role.name) {
        throw new BadRequestException('Cannot rename a system role');
      }
    }

    const { name, description, permissionIds } = updateRoleDto;

    return this.prisma.$transaction(async (tx) => {
      const updatedRole = await tx.role.update({
        where: { id },
        data: {
          name: name ? name.toUpperCase() : undefined,
          description: description !== undefined ? description : undefined,
        },
      });

      if (permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({
          where: { roleId: id },
        });

        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permId) => ({
              roleId: id,
              permissionId: permId,
            })),
          });
        }
      }

      return tx.role.findUnique({
        where: { id },
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      });
    });
  }

  async remove(id: string) {
    const role = await this.findOne(id);
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    const usersCount = await this.prisma.user.count({
      where: { roleId: id },
    });
    if (usersCount > 0) {
      throw new BadRequestException(`Cannot delete role. There are ${usersCount} user(s) assigned to it.`);
    }

    await this.prisma.role.delete({
      where: { id },
    });

    return { message: `Role "${role.name}" deleted successfully` };
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [
        { module: 'asc' },
        { action: 'asc' },
      ],
    });
  }

  async syncPermissions(id: string, permissionIds: string[], currentUser?: any) {
    const role = await this.findOne(id);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId: id },
      });

      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permId) => ({
            roleId: id,
            permissionId: permId,
          })),
        });
      }

      return tx.role.findUnique({
        where: { id },
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      });
    });

    // Audit log
    if (currentUser) {
      await this.audit.log(
        currentUser.id,
        currentUser.email,
        'ROLE_PERMISSIONS_SYNCED',
        id,
        'ROLE',
        `Synced ${permissionIds.length} permission(s) for role "${role.name}"`,
      );
    }

    return result;
  }
}
