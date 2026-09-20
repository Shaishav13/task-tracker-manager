import { Injectable, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { UsersService } from './users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async register(dto: RegisterDto, creator: any) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const targetRole = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!targetRole) {
      throw new BadRequestException('Specified role not found');
    }

    const ROLE_HIERARCHY: Record<string, number> = {
      SUPER_ADMIN: 5,
      ADMIN: 4,
      MANAGER: 3,
      TEAM_LEAD: 2,
      TEAM_MEMBER: 1,
    };

    const creatorId = creator.id;
    const creatorRoleName = creator.role?.name;
    const creatorPriority = ROLE_HIERARCHY[creatorRoleName] || 0;
    const targetPriority = ROLE_HIERARCHY[targetRole.name] || 0;

    if (creatorPriority <= targetPriority && creatorRoleName !== 'SUPER_ADMIN') {
      throw new ForbiddenException(`You are not authorized to create users with the role "${targetRole.name}"`);
    }

    let finalManagerId: string | null = null;

    if (dto.managerId) {
      const managerUser = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
        include: { role: true },
      });
      if (!managerUser) {
        throw new BadRequestException('Specified manager not found');
      }

      const managerRoleName = managerUser.role?.name;
      const managerPriority = ROLE_HIERARCHY[managerRoleName] || 0;
      if (managerPriority <= targetPriority) {
        throw new BadRequestException(`A user with role "${managerRoleName}" cannot manage a user with role "${targetRole.name}"`);
      }

      if (creatorRoleName !== 'SUPER_ADMIN') {
        if (creatorRoleName === 'ADMIN') {
          // Admin can assign any manager as long as it fits hierarchy
        } else if (creatorRoleName === 'MANAGER') {
          if (managerUser.id !== creatorId && managerUser.managerId !== creatorId) {
            throw new ForbiddenException('You can only assign subordinates to yourself or to team leads under your management');
          }
        } else if (creatorRoleName === 'TEAM_LEAD') {
          if (managerUser.id !== creatorId) {
            throw new ForbiddenException('You can only assign subordinates to yourself');
          }
        }
      }
      finalManagerId = dto.managerId;
    } else {
      if (creatorRoleName !== 'SUPER_ADMIN') {
        finalManagerId = creatorId;
      }
    }

    // Password complexity check (minimum 8 characters, at least one letter and one number)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(dto.password)) {
      throw new BadRequestException('Password must contain both letters and numbers');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        roleId: dto.roleId,
        managerId: finalManagerId,
      },
      select: { id: true, name: true, email: true, roleId: true, managerId: true, createdAt: true },
    });

    return user;
  }

  async login(dto: LoginDto, res: Response) {
    const MAX_FAILED_ATTEMPTS = 5;
    const LOCKOUT_MINUTES = 15;

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    // Account lockout check — do this BEFORE password check to avoid timing oracle
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new UnauthorizedException(
        `Account locked due to too many failed attempts. Try again in ${remainingMin} minute(s).`
      );
    }

    // Validate password
    const passwordValid = user && (await bcrypt.compare(dto.password, user.passwordHash));

    if (!user || !passwordValid) {
      if (user) {
        // Increment failed attempt counter, lock if threshold reached
        const newFailedCount = user.failedLoginAttempts + 1;
        const shouldLock = newFailedCount >= MAX_FAILED_ATTEMPTS;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: newFailedCount,
            ...(shouldLock && {
              lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
            }),
          },
        });
        if (shouldLock) {
          throw new UnauthorizedException(
            `Too many failed login attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`
          );
        }
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Successful login — reset failure counter and any lock
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.roleId);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    this.setRefreshTokenCookie(res, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: { id: user.role.id, name: user.role.name },
      },
    };
  }


  // ADDED: Decodes JWT Access Token and returns complete User Profile for GET /auth/me
  async getProfileFromToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'super_secret_jwt_key',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { role: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: { id: user.role.id, name: user.role.name },
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async refreshTokens(refreshToken: string, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_key',
      });
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token signature');
    }

    const activeTokens = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revoked: false, expiresAt: { gt: new Date() } },
      include: { user: { include: { role: true } } },
    });

    let activeToken = null;
    for (const token of activeTokens) {
      if (await bcrypt.compare(refreshToken, token.hashedToken)) {
        activeToken = token;
        break;
      }
    }

    if (!activeToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke old token (Refresh Token Rotation)
    await this.prisma.refreshToken.update({
      where: { id: activeToken.id },
      data: { revoked: true },
    });

    // Generate new tokens and store/set cookie
    const tokens = await this.generateTokens(activeToken.user.id, activeToken.user.email, activeToken.user.roleId);
    await this.storeRefreshToken(activeToken.user.id, tokens.refreshToken);
    this.setRefreshTokenCookie(res, tokens.refreshToken);

    return { accessToken: tokens.accessToken };
  }

  async logout(userId: string, res: Response) {
    if (userId) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return { message: 'Successfully logged out' };
  }

  private async generateTokens(userId: string, email: string, roleId: string) {
    const payload = { sub: userId, email, roleId };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET || 'super_secret_jwt_key',
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_key',
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, refreshToken: string) {
    const hashedToken = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        hashedToken,
        expiresAt,
      },
    });
  }

  private setRefreshTokenCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Use 'lax' for local development across origins (localhost:4200 to localhost:3000)
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}