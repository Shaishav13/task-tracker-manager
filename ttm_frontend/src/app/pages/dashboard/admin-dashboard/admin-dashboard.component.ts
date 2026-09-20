import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { UsersService, UserManagementItem } from '../../../core/services/users.service';
import { RolesService, Role } from '../../../core/services/roles.service';
import { ExportService } from '../../../core/services/export.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {
  activeTab = signal<'overview' | 'teams' | 'users' | 'recent-tasks' | 'audit'>('overview');
  isSidebarCollapsed = signal<boolean>(false);
  
  toggleSidebar(): void {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }
  
  // Executive Summary & Metrics
  executiveData = signal<any>(null);
  recentTasks = signal<any[]>([]);
  managers = signal<any[]>([]);
  usersList = signal<UserManagementItem[]>([]);
  auditLogs = signal<any[]>([]);
  rolesList = signal<Role[]>([]);
  userSearchQuery = signal<string>('');
  
  // User Creation Modal State
  showCreateUserModal = signal<boolean>(false);
  newUser = {
    name: '',
    email: '',
    password: '',
    roleId: '',
    managerId: ''
  };
  createUserError = signal<string | null>(null);
  createUserSuccess = signal<string | null>(null);
  isSubmittingUser = signal<boolean>(false);

  // Automated Digest Simulation Status
  digestStatus = signal<string | null>(null);

  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Pagination & Filtering
  page = signal<number>(1);
  pageSize = signal<number>(10);
  totalPages = signal<number>(1);
  dateFrom: string = '';
  dateTo: string = '';

  constructor(
    private analytics: AnalyticsService,
    private usersService: UsersService,
    private rolesService: RolesService,
    private exportService: ExportService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadAllDashboardData();
    this.fetchRoles();
  }

  setTab(tab: 'overview' | 'teams' | 'users' | 'recent-tasks' | 'audit'): void {
    this.activeTab.set(tab);
    if (tab === 'users' && this.usersList().length === 0) {
      this.fetchUsers();
    }
    if (tab === 'audit') {
      this.fetchAuditLogs();
    }
  }

  loadAllDashboardData(): void {
    this.loading.set(true);
    this.fetchExecutiveSummary();
    this.fetchManagers();
    this.fetchRecentTasks();
  }

  fetchExecutiveSummary(): void {
    const df = this.dateFrom || undefined;
    const dt = this.dateTo || undefined;
    this.analytics.getExecutiveSummary(df, dt).subscribe({
      next: (data) => this.executiveData.set(data),
      error: (err) => console.error('Failed to load executive summary:', err)
    });
  }

  fetchManagers(): void {
    this.loading.set(true);
    const df = this.dateFrom || undefined;
    const dt = this.dateTo || undefined;

    this.analytics.getManagersPerformance(this.page(), this.pageSize(), df, dt).subscribe({
      next: (res) => {
        this.managers.set(res.managers || []);
        if (res.pagination) {
          this.totalPages.set(res.pagination.total_pages);
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error fetching managers performance:', err);
        this.error.set('Failed to load manager performance data.');
        this.loading.set(false);
      }
    });
  }

  fetchRecentTasks(): void {
    this.analytics.getRecentTasks(20).subscribe({
      next: (res) => this.recentTasks.set(res.tasks || []),
      error: (err) => console.error('Error fetching recent tasks:', err)
    });
  }

  fetchUsers(): void {
    this.usersService.getUsers().subscribe({
      next: (users) => this.usersList.set(users || []),
      error: (err) => console.error('Error loading users:', err)
    });
  }

  fetchRoles(): void {
    this.rolesService.fetchRoles().subscribe({
      next: (roles) => this.rolesList.set(roles || []),
      error: (err) => console.error('Error loading roles:', err)
    });
  }

  fetchAuditLogs(): void {
    this.usersService.getAuditLogs().subscribe({
      next: (logs) => this.auditLogs.set(logs || []),
      error: (err) => console.error('Error loading audit logs:', err)
    });
  }

  toggleUserStatus(user: UserManagementItem): void {
    const action$ = user.isActive
      ? this.usersService.deactivateUser(user.id)
      : this.usersService.activateUser(user.id);

    action$.subscribe({
      next: () => {
        user.isActive = !user.isActive;
        this.usersList.set([...this.usersList()]);
      },
      error: (err) => alert(err.error?.message || 'Failed to update user status')
    });
  }

  openCreateUserModal(): void {
    this.createUserError.set(null);
    this.createUserSuccess.set(null);
    this.newUser = { name: '', email: '', password: '', roleId: '', managerId: '' };
    this.showCreateUserModal.set(true);
  }

  closeCreateUserModal(): void {
    this.showCreateUserModal.set(false);
  }

  submitCreateUser(): void {
    if (!this.newUser.name || !this.newUser.email || !this.newUser.password || !this.newUser.roleId) {
      this.createUserError.set('Please fill out all required fields.');
      return;
    }

    this.isSubmittingUser.set(true);
    this.createUserError.set(null);

    const payload: any = {
      name: this.newUser.name,
      email: this.newUser.email,
      password: this.newUser.password,
      roleId: this.newUser.roleId
    };

    if (this.newUser.managerId) {
      payload.managerId = this.newUser.managerId;
    }

    this.usersService.createUser(payload).subscribe({
      next: () => {
        this.isSubmittingUser.set(false);
        this.createUserSuccess.set(`User ${this.newUser.name} created successfully!`);
        this.fetchUsers();
        setTimeout(() => this.closeCreateUserModal(), 1200);
      },
      error: (err) => {
        this.isSubmittingUser.set(false);
        this.createUserError.set(err.error?.message || 'Failed to create user');
      }
    });
  }

  triggerAutomatedDigest(): void {
    this.digestStatus.set('Generating executive PDF report & sending email digest to management...');
    setTimeout(() => {
      this.exportManagerDataPdf();
      this.digestStatus.set('Digest email dispatched successfully to all active managers.');
      setTimeout(() => this.digestStatus.set(null), 4000);
    }, 1000);
  }

  get availableManagers(): UserManagementItem[] {
    return this.usersList().filter(u => u.role.name === 'MANAGER' || u.role.name === 'SUPER_ADMIN' || u.role.name === 'ADMIN');
  }

  selectedRoleFilter = signal<string>('ALL');

  getRoleRankInfo(roleName: string): { rank: number; label: string; cssClass: string } {
    switch (roleName) {
      case 'SUPER_ADMIN':
        return { rank: 5, label: 'Super Admin', cssClass: 'rank-badge rank-5' };
      case 'ADMIN':
        return { rank: 4, label: 'Admin', cssClass: 'rank-badge rank-4' };
      case 'MANAGER':
        return { rank: 3, label: 'Manager', cssClass: 'rank-badge rank-3' };
      case 'TEAM_LEAD':
        return { rank: 2, label: 'Team Lead', cssClass: 'rank-badge rank-2' };
      default:
        return { rank: 1, label: 'Team Member', cssClass: 'rank-badge rank-1' };
    }
  }

  get currentUserRole(): string {
    const user = this.authService.currentUser();
    if (!user || !user.role) return 'TEAM_MEMBER';
    return typeof user.role === 'string' ? user.role : user.role.name;
  }

  get currentUserRank(): number {
    return this.getRoleRankInfo(this.currentUserRole).rank;
  }

  get canManageRoles(): boolean {
    return this.currentUserRole === 'SUPER_ADMIN';
  }

  get canViewAuditLogs(): boolean {
    return this.currentUserRole === 'SUPER_ADMIN' || this.currentUserRole === 'ADMIN';
  }

  get canCreateUsers(): boolean {
    return ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(this.currentUserRole);
  }

  get canSendReportDigest(): boolean {
    return ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(this.currentUserRole);
  }

  canManageUser(targetUser: UserManagementItem): boolean {
    const actorRole = this.currentUserRole;
    const actorRank = this.currentUserRank;
    const targetRole = targetUser.role.name;
    const targetRank = this.getRoleRankInfo(targetRole).rank;

    if (actorRole === 'SUPER_ADMIN') {
      return targetUser.id !== this.authService.currentUser()?.id;
    }

    if (targetRole === 'SUPER_ADMIN') {
      return false;
    }

    return actorRank > targetRank;
  }

  get availableAssignableRoles(): Role[] {
    const actorRole = this.currentUserRole;
    const actorRank = this.currentUserRank;

    return this.rolesList().filter(role => {
      if (actorRole === 'SUPER_ADMIN') return true;
      const roleRank = this.getRoleRankInfo(role.name).rank;
      return roleRank < actorRank;
    });
  }

  get filteredUsers(): UserManagementItem[] {
    const q = this.userSearchQuery().toLowerCase().trim();
    const roleFilter = this.selectedRoleFilter();

    return this.usersList().filter(u => {
      const matchesSearch = !q || (
        u.name.toLowerCase().includes(q) || 
        u.email.toLowerCase().includes(q) || 
        u.role.name.toLowerCase().includes(q)
      );
      const matchesRole = roleFilter === 'ALL' || u.role.name === roleFilter;

      return matchesSearch && matchesRole;
    });
  }

  applyFilters(): void {
    this.page.set(1);
    this.loadAllDashboardData();
  }

  exportManagerDataCsv(): void {
    const data = this.managers().map(m => ({
      'Manager Name': m.manager_name,
      'Total Teams': m.total_teams,
      'Total Tasks': m.total_tasks,
      'Completed Tasks': m.completed,
      'Completion Rate (%)': m.completion_rate_pct,
      'Avg Hours / Task': m.avg_completion_hrs,
      'Overdue Tasks': m.overdue,
      'Top Team': m.best_performing_team || 'N/A'
    }));
    this.exportService.exportToCsv('executive_manager_performance_report', data);
  }

  exportManagerDataPdf(): void {
    const headers = ['Manager', 'Teams', 'Total Tasks', 'Completed', 'Rate (%)', 'Overdue', 'Top Team'];
    const rows = this.managers().map(m => [
      m.manager_name,
      m.total_teams,
      m.total_tasks,
      m.completed,
      `${m.completion_rate_pct}%`,
      m.overdue,
      m.best_performing_team || 'N/A'
    ]);
    this.exportService.exportToPdf('Manager Performance Oversight Summary', headers, rows);
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.page.set(this.page() + 1);
      this.fetchManagers();
    }
  }

  prevPage(): void {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.fetchManagers();
    }
  }
}
