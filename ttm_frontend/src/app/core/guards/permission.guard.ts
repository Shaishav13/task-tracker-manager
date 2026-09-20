import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const permissionGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();
  
  if (!user) {
    return router.parseUrl('/login');
  }

  const allowedRoles = route.data?.['allowedRoles'] as string[];
  if (allowedRoles && !allowedRoles.includes(user.role.name)) {
    return router.parseUrl('/dashboard');
  }

  return true;
};
