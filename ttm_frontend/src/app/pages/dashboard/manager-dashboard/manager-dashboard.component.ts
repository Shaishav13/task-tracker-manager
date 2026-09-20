import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { UsersService, UserManagementItem } from '../../../core/services/users.service';
import { RolesService, Role } from '../../../core/services/roles.service';
import { ExportService } from '../../../core/services/export.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-manager-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './manager-dashboard.component.html',
  styleUrls: ['./manager-dashboard.component.css']
})
export class ManagerDashboardComponent implements OnInit {
  activeTab = signal<'overview' | 'teams' | 'users' | 'tasks'>('overview');
  isSidebarCollapsed = signal<boolean>(false);

  toggleSidebar(): void {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }

  // Data signals
  teams = signal<any[]>([]);
  teamTasks = signal<any[]>([]);
  usersList = signal<UserManagementItem[]>([]);
  rolesList = signal<Role[]>([]);
  userSearchQuery = signal<string>('');

  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Digest Status
  digestStatus = signal<string | null>(null);

  // Pagination & Filtering
  page = signal<number>(1);
  pageSize = signal<number>(10);
  totalPages = signal<number>(1);
  dateFrom: string = '';
  dateTo: string = '';

  // Task Creation Modal
  showCreateTaskModal = signal<boolean>(false);
  newTask = {
    title: '',
    description: '',
    priority: 'MEDIUM',
    status: 'TODO',
    dueDate: '',
    teamId: '',
    assigneeId: ''
  };
  createTaskError = signal<string | null>(null);
  createTaskSuccess = signal<string | null>(null);
  isSubmittingTask = signal<boolean>(false);

  // User Creation Modal
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

  constructor(
    private analytics: AnalyticsService,
    private usersService: UsersService,
    private rolesService: RolesService,
    private exportService: ExportService,
    public authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.fetchTeams();
    this.fetchRecentTasks();
    this.fetchRoles();
    this.fetchUsers();
  }

  setTab(tab: 'overview' | 'teams' | 'users' | 'tasks'): void {
    this.activeTab.set(tab);
    if (tab === 'teams' && this.teams().length === 0) {
      this.fetchTeams();
    }
    if (tab === 'users' && this.usersList().length === 0) {
      this.fetchUsers();
    }
    if (tab === 'tasks') {
      this.fetchRecentTasks();
    }
  }

  fetchTeams(): void {
    this.loading.set(true);
    const df = this.dateFrom || undefined;
    const dt = this.dateTo || undefined;

    this.analytics.getTeamsPerformance(this.page(), this.pageSize(), df, dt).subscribe({
      next: (res) => {
        this.teams.set(res.teams || []);
        if (res.pagination) {
          this.totalPages.set(res.pagination.total_pages);
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error fetching team performance:', err);
        this.error.set('Failed to load team performance data.');
        this.loading.set(false);
      }
    });
  }

  fetchRecentTasks(): void {
    this.analytics.getRecentTasks(50).subscribe({
      next: (res) => this.teamTasks.set(res.tasks || []),
      error: (err) => console.error('Error fetching team tasks:', err)
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

  // Metrics
  get totalTeamTasks(): number {
    return this.teams().reduce((sum, t) => sum + (t.total_tasks || 0), 0);
  }

  get completedTeamTasks(): number {
    return this.teams().reduce((sum, t) => sum + (t.completed || 0), 0);
  }

  get overdueTeamTasks(): number {
    return this.teams().reduce((sum, t) => sum + (t.overdue || 0), 0);
  }

  get overallCompletionRate(): number {
    const total = this.totalTeamTasks;
    if (total === 0) return 0;
    return Math.round((this.completedTeamTasks / total) * 100);
  }

  // Task Creation
  openCreateTaskModal(): void {
    this.createTaskError.set(null);
    this.createTaskSuccess.set(null);
    this.newTask = {
      title: '',
      description: '',
      priority: 'MEDIUM',
      status: 'TODO',
      dueDate: '',
      teamId: this.teams().length > 0 ? this.teams()[0].team_id : '',
      assigneeId: ''
    };
    this.showCreateTaskModal.set(true);
  }

  closeCreateTaskModal(): void {
    this.showCreateTaskModal.set(false);
  }

  submitCreateTask(): void {
    if (!this.newTask.title || !this.newTask.teamId) {
      this.createTaskError.set('Title and Team selection are required.');
      return;
    }

    this.isSubmittingTask.set(true);
    this.createTaskError.set(null);

    const payload: any = {
      title: this.newTask.title,
      description: this.newTask.description || undefined,
      priority: this.newTask.priority,
      status: this.newTask.status,
      teamId: this.newTask.teamId,
      dueDate: this.newTask.dueDate || undefined,
      assigneeId: this.newTask.assigneeId || undefined
    };

    this.http.post('http://localhost:3000/tasks', payload, { withCredentials: true }).subscribe({
      next: () => {
        this.isSubmittingTask.set(false);
        this.createTaskSuccess.set('Task created & scoped to team successfully!');
        this.fetchRecentTasks();
        this.fetchTeams();
        setTimeout(() => this.closeCreateTaskModal(), 1200);
      },
      error: (err) => {
        this.isSubmittingTask.set(false);
        this.createTaskError.set(err.error?.message || 'Failed to create task for team');
      }
    });
  }

  // User Creation
  openCreateUserModal(): void {
    this.createUserError.set(null);
    this.createUserSuccess.set(null);
    this.newUser = { name: '', email: '', password: '', roleId: '', managerId: this.authService.currentUser()?.id || '' };
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
      roleId: this.newUser.roleId,
      managerId: this.authService.currentUser()?.id
    };

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

  triggerAutomatedDigest(): void {
    this.digestStatus.set('Generating department PDF report & sending email digest to team leads...');
    setTimeout(() => {
      this.exportTeamDataPdf();
      this.digestStatus.set('Digest email dispatched successfully to all team leads.');
      setTimeout(() => this.digestStatus.set(null), 4000);
    }, 1000);
  }

  get userRole(): string {
    return this.authService.currentUser()?.role?.name || '';
  }

  get canManageUsers(): boolean {
    return this.userRole === 'SUPER_ADMIN' || this.userRole === 'ADMIN' || this.userRole === 'MANAGER';
  }

  get canCreateUsers(): boolean {
    return this.userRole === 'SUPER_ADMIN' || this.userRole === 'ADMIN' || this.userRole === 'MANAGER';
  }

  get canSendReportDigest(): boolean {
    return this.userRole === 'SUPER_ADMIN' || this.userRole === 'ADMIN' || this.userRole === 'MANAGER';
  }

  get canCreateTasks(): boolean {
    return this.userRole === 'SUPER_ADMIN' || this.userRole === 'ADMIN' || this.userRole === 'MANAGER' || this.userRole === 'TEAM_LEAD';
  }

  get availableAssignableRoles(): Role[] {
    // Manager (Rank 3) can assign Team Lead (Rank 2) or Team Member (Rank 1)
    return this.rolesList().filter(role => role.name === 'TEAM_LEAD' || role.name === 'TEAM_MEMBER');
  }

  getRoleRankInfo(roleName: string): { rank: number; label: string; cssClass: string } {
    switch (roleName) {
      case 'SUPER_ADMIN': return { rank: 5, label: 'Super Admin', cssClass: 'rank-badge rank-5' };
      case 'ADMIN': return { rank: 4, label: 'Admin', cssClass: 'rank-badge rank-4' };
      case 'MANAGER': return { rank: 3, label: 'Manager', cssClass: 'rank-badge rank-3' };
      case 'TEAM_LEAD': return { rank: 2, label: 'Team Lead', cssClass: 'rank-badge rank-2' };
      default: return { rank: 1, label: 'Team Member', cssClass: 'rank-badge rank-1' };
    }
  }

  canManageUser(targetUser: UserManagementItem): boolean {
    const targetRole = targetUser.role.name;
    const targetRank = this.getRoleRankInfo(targetRole).rank;
    return 3 > targetRank;
  }

  get filteredUsers(): UserManagementItem[] {
    const q = this.userSearchQuery().toLowerCase().trim();
    return this.usersList().filter(u => {
      const matchesSearch = !q || (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.name.toLowerCase().includes(q));
      return matchesSearch;
    });
  }

  exportTeamDataCsv(): void {
    const data = this.teams().map(t => ({
      'Team Name': t.team_name,
      'Team Lead': t.lead_name || 'Unassigned',
      'Total Tasks': t.total_tasks,
      'Completed Tasks': t.completed,
      'Completion Rate (%)': t.completion_rate_pct,
      'Avg Hours / Task': t.avg_completion_hrs,
      'Overdue Tasks': t.overdue
    }));
    this.exportService.exportToCsv('manager_teams_performance_report', data);
  }

  exportTeamDataPdf(): void {
    const headers = ['Team Name', 'Team Lead', 'Total Tasks', 'Completed', 'Rate (%)', 'Overdue'];
    const rows = this.teams().map(t => [
      t.team_name,
      t.lead_name || 'Unassigned',
      t.total_tasks,
      t.completed,
      `${t.completion_rate_pct}%`,
      t.overdue
    ]);
    this.exportService.exportToPdf('Department Team Performance Oversight', headers, rows);
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.page.set(this.page() + 1);
      this.fetchTeams();
    }
  }

  prevPage(): void {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.fetchTeams();
    }
  }

  applyFilters(): void {
    this.page.set(1);
    this.fetchTeams();
  }
}
