import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto, ChangePasswordDto, AdminResetPasswordDto } from './dto/user-management.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  managerId: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true } },
};

const ROLE_RANKS: Record<string, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
  MANAGER: 3,
  TEAM_LEAD: 2,
  TEAM_MEMBER: 1,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Basic lookups ────────────────────────────────────────────────────────

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ─── List users (role-scoped) ─────────────────────────────────────────────

  async findAll(currentUser: any) {
    const roleName: string = currentUser.role?.name;

    if (roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') {
      return this.prisma.user.findMany({
        select: USER_SELECT,
        orderBy: { name: 'asc' },
      });
    }

    if (roleName === 'MANAGER') {
      // Manager sees users they directly manage (team leads + members under them)
      return this.prisma.user.findMany({
        where: {
          OR: [
            { managerId: currentUser.id },
            { manager: { managerId: currentUser.id } },
          ],
        },
        select: USER_SELECT,
        orderBy: { name: 'asc' },
      });
    }

    if (roleName === 'TEAM_LEAD') {
      return this.prisma.user.findMany({
        where: { managerId: currentUser.id },
        select: USER_SELECT,
        orderBy: { name: 'asc' },
      });
    }

    // TEAM_MEMBER: can only see themselves
    return this.prisma.user.findMany({
      where: { id: currentUser.id },
      select: USER_SELECT,
    });
  }

  // ─── Get single user ──────────────────────────────────────────────────────

  async findOneScoped(targetId: string, currentUser: any) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: USER_SELECT,
    });
    if (!target) throw new NotFoundException('User not found');

    this.assertCanAccessUser(target, currentUser);
    return target;
  }

  // ─── Update user profile or role ──────────────────────────────────────────

  async updateProfile(targetId: string, dto: UpdateUserDto, currentUser: any) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (targetId !== currentUser.id) {
      await this.assertCanManageTarget(currentUser, target, dto.roleId);
    }

    if (dto.email && dto.email !== target.email) {
      const conflict = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (conflict) throw new ConflictException('Email already in use');
    }

    return this.prisma.user.update({
      where: { id: targetId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.email && { email: dto.email }),
        ...(dto.roleId && { roleId: dto.roleId }),
        ...(dto.managerId !== undefined && { managerId: dto.managerId || null }),
      },
      select: USER_SELECT,
    }).then(async (updated) => {
      await this.audit.log(
        currentUser.id,
        currentUser.email,
        'USER_UPDATED',
        targetId,
        'USER',
        `Updated user "${target.name}" (${target.email}) details/role`,
      );
      return updated;
    });
  }

  // ─── Change own password ──────────────────────────────────────────────────

  async changePassword(targetId: string, dto: ChangePasswordDto, currentUser: any) {
    if (targetId !== currentUser.id) {
      throw new ForbiddenException('You can only change your own password');
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(dto.newPassword)) {
      throw new BadRequestException('Password must contain both letters and numbers');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: targetId }, data: { passwordHash } });

    await this.prisma.refreshToken.updateMany({
      where: { userId: targetId, revoked: false },
      data: { revoked: true },
    });

    return { message: 'Password changed successfully. Please log in again.' };
  }

  // ─── Admin: reset another user's password ────────────────────────────────

  async adminResetPassword(targetId: string, dto: AdminResetPasswordDto, currentUser: any) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.assertCanManageTarget(currentUser, target);

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: targetId, revoked: false },
      data: { revoked: true },
    });

    await this.audit.log(
      currentUser.id,
      currentUser.email,
      'PASSWORD_RESET_BY_ADMIN',
      targetId,
      'USER',
      `Reset password for user "${target.name}" (${target.email})`,
    );

    return { message: `Password reset successfully for user "${target.name}"` };
  }

  // ─── Activate / Deactivate ────────────────────────────────────────────────

  async setActiveStatus(targetId: string, isActive: boolean, currentUser: any) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (target.role?.name === 'SUPER_ADMIN') {
      throw new ForbiddenException('The Super Admin account cannot be deactivated');
    }
    if (targetId === currentUser.id) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    await this.assertCanManageTarget(currentUser, target);

    return this.prisma.user.update({
      where: { id: targetId },
      data: { isActive },
      select: USER_SELECT,
    }).then(async (updated) => {
      await this.audit.log(
        currentUser.id,
        currentUser.email,
        isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        targetId,
        'USER',
        `${isActive ? 'Activated' : 'Deactivated'} account for user "${target.name}" (${target.email})`,
      );
      return updated;
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private getRoleRank(roleName?: string): number {
    if (!roleName) return 0;
    return ROLE_RANKS[roleName] || 1;
  }

  private async assertCanManageTarget(currentUser: any, targetUser: any, newRoleId?: string) {
    const currentUserRole = currentUser.role?.name;
    const currentUserRank = this.getRoleRank(currentUserRole);

    // Super Admin can manage anyone
    if (currentUserRole === 'SUPER_ADMIN') return;

    const targetUserRank = this.getRoleRank(targetUser.role?.name);

    // Rank rule: Cannot manage or edit someone with a higher rank than yourself
    if (targetUserRank > currentUserRank) {
      throw new ForbiddenException(
        'You cannot perform management actions or edit users of a higher rank than yourself'
      );
    }

    // Target role rank rule (if changing target's role)
    if (newRoleId) {
      const newRole = await this.prisma.role.findUnique({ where: { id: newRoleId } });
      if (newRole) {
        const newRoleRank = this.getRoleRank(newRole.name);
        if (newRoleRank > currentUserRank) {
          throw new ForbiddenException(
            'You cannot assign a role with a higher rank than your own rank'
          );
        }
      }
    }
  }

  private assertCanAccessUser(target: any, currentUser: any) {
    const roleName: string = currentUser.role?.name;
    if (roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') return;
    if (target.id === currentUser.id) return;

    if (roleName === 'MANAGER') {
      if (
        target.managerId === currentUser.id ||
        target.manager?.managerId === currentUser.id
      )
        return;
      throw new ForbiddenException('You do not have access to this user');
    }

    if (roleName === 'TEAM_LEAD') {
      if (target.managerId === currentUser.id) return;
      throw new ForbiddenException('You do not have access to this user');
    }

    throw new ForbiddenException('You can only view your own profile');
  }
}