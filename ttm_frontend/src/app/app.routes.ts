import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'tasks',
    loadComponent: () => import('./pages/tasks/tasks.component').then(m => m.TasksComponent),
    canActivate: [authGuard]
  },
  {
    path: 'roles-permissions',
    loadComponent: () => import('./pages/roles-permissions/roles-permissions.component').then(m => m.RolesPermissionsComponent),
    canActivate: [authGuard, permissionGuard],
    data: { allowedRoles: ['SUPER_ADMIN', 'ADMIN'] }
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];