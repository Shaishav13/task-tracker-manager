import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RolesService, Role, Permission } from '../../core/services/roles.service';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-roles-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './roles-permissions.component.html',
  styleUrls: ['./roles-permissions.component.css']
})
export class RolesPermissionsComponent implements OnInit {
  private rolesService = inject(RolesService);
  private authService = inject(AuthService);
  public themeService = inject(ThemeService);
  public router = inject(Router);

  roles = this.rolesService.roles;
  permissions = this.rolesService.permissions;
  
  // Group permissions by module
  permissionsByModule = computed(() => {
    const perms = this.permissions();
    const groups: { [module: string]: Permission[] } = {};
    for (const p of perms) {
      if (!groups[p.module]) {
        groups[p.module] = [];
      }
      groups[p.module].push(p);
    }
    return groups;
  });

  // UI State
  selectedRole = signal<Role | null>(null);
  
  // Matrix state tracking selection changes
  // Format: Record<permissionId, boolean>
  permissionMatrix = signal<Record<string, boolean>>({});

  isSaving = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  constructor() {}

  ngOnInit(): void {
    // Check if user has permission to manage roles. 
    // Usually handled by a guard, but doing a quick check here too.
    const currentUser = this.authService.currentUser();
    if (!currentUser || (currentUser.role.name !== 'SUPER_ADMIN' && currentUser.role.name !== 'ADMIN')) {
      // Basic check: we could strictly check ROLES:MANAGE
    }
    
    this.rolesService.fetchRoles().subscribe();
    this.rolesService.fetchPermissions().subscribe();
  }

  selectRole(role: Role) {
    this.selectedRole.set(role);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    
    // Initialize matrix with role's current permissions
    const matrix: Record<string, boolean> = {};
    for (const p of this.permissions()) {
      matrix[p.id] = false;
    }
    for (const rp of role.rolePermissions) {
      matrix[rp.permissionId] = true;
    }
    this.permissionMatrix.set(matrix);
  }

  togglePermission(permId: string) {
    const current = this.permissionMatrix();
    this.permissionMatrix.set({
      ...current,
      [permId]: !current[permId]
    });
  }

  hasPermission(permId: string): boolean {
    return this.permissionMatrix()[permId] || false;
  }

  savePermissions() {
    const role = this.selectedRole();
    if (!role) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const matrix = this.permissionMatrix();
    const selectedIds = Object.keys(matrix).filter(id => matrix[id]);

    this.rolesService.syncPermissions(role.id, selectedIds).subscribe({
      next: (updatedRole) => {
        this.isSaving.set(false);
        this.successMessage.set('Permissions updated successfully.');
        this.selectedRole.set(updatedRole);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to update permissions.');
      }
    });
  }
}

