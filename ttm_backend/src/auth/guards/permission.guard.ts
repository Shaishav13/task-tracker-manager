import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.get<RequiredPermission>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    if (!requiredPermission) {
      return true; // No permission metadata required for this route
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Guard against undefined user to avoid 500 server crash
    if (!user) {
      throw new UnauthorizedException('User session unauthenticated');
    }

    // Superadmin bypass if applicable
    if (user.role?.name === 'SUPER_ADMIN' || user.role?.name === 'superadmin') {
      return true;
    }

    // Check permissions
    const hasPermission = user.role?.rolePermissions?.some(
      (rp: any) => rp.permission?.module === requiredPermission.module && rp.permission?.action === requiredPermission.action,
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions for this resource');
    }

    return true;
  }
}