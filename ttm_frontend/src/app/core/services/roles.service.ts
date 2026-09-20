import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface Permission {
  id: string;
  module: string;
  action: string;
  createdAt: string;
}

export interface RolePermission {
  roleId: string;
  permissionId: string;
  permission: Permission;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  rolePermissions: RolePermission[];
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class RolesService {
  private readonly API_URL = 'http://localhost:3000/roles';

  readonly roles = signal<Role[]>([]);
  readonly permissions = signal<Permission[]>([]);

  constructor(private http: HttpClient) {}

  fetchRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(this.API_URL, { withCredentials: true }).pipe(
      tap((roles) => this.roles.set(roles))
    );
  }

  fetchPermissions(): Observable<Permission[]> {
    return this.http.get<Permission[]>(`${this.API_URL}/permissions`, { withCredentials: true }).pipe(
      tap((permissions) => this.permissions.set(permissions))
    );
  }

  createRole(data: { name: string; description?: string; permissionIds?: string[] }): Observable<Role> {
    return this.http.post<Role>(this.API_URL, data, { withCredentials: true }).pipe(
      tap(() => this.fetchRoles().subscribe())
    );
  }

  updateRole(id: string, data: { name?: string; description?: string; permissionIds?: string[] }): Observable<Role> {
    return this.http.patch<Role>(`${this.API_URL}/${id}`, data, { withCredentials: true }).pipe(
      tap(() => this.fetchRoles().subscribe())
    );
  }

  syncPermissions(id: string, permissionIds: string[]): Observable<Role> {
    return this.http.put<Role>(`${this.API_URL}/${id}/permissions`, { permissionIds }, { withCredentials: true }).pipe(
      tap(() => this.fetchRoles().subscribe())
    );
  }

  deleteRole(id: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}`, { withCredentials: true }).pipe(
      tap(() => this.fetchRoles().subscribe())
    );
  }
}
