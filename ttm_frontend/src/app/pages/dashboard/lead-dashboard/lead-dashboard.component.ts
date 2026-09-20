import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { ExportService } from '../../../core/services/export.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-lead-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lead-dashboard.component.html',
  styleUrls: ['./lead-dashboard.component.css']
})
export class LeadDashboardComponent implements OnInit {
  activeTab = signal<'overview' | 'members' | 'tasks'>('overview');
  isSidebarCollapsed = signal<boolean>(false);

  toggleSidebar(): void {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }

  teams = signal<any[]>([]);
  teamTasks = signal<any[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

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

  constructor(
    private analytics: AnalyticsService,
    private exportService: ExportService,
    private http: HttpClient,
    public authService: AuthService
  ) {}

  get userRole(): string {
    return this.authService.currentUser()?.role?.name || '';
  }

  get canCreateTasks(): boolean {
    return this.userRole === 'SUPER_ADMIN' || this.userRole === 'ADMIN' || this.userRole === 'MANAGER' || this.userRole === 'TEAM_LEAD';
  }

  ngOnInit(): void {
    this.fetchTeams();
    this.fetchRecentTasks();
  }

  setTab(tab: 'overview' | 'members' | 'tasks'): void {
    this.activeTab.set(tab);
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
        console.error('Error fetching lead team performance:', err);
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

  get totalLeadTasks(): number {
    return this.teams().reduce((sum, t) => sum + (t.total_tasks || 0), 0);
  }

  get completedLeadTasks(): number {
    return this.teams().reduce((sum, t) => sum + (t.completed || 0), 0);
  }

  get overdueLeadTasks(): number {
    return this.teams().reduce((sum, t) => sum + (t.overdue || 0), 0);
  }

  get overallCompletionRate(): number {
    const total = this.totalLeadTasks;
    if (total === 0) return 0;
    return Math.round((this.completedLeadTasks / total) * 100);
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
        this.createTaskSuccess.set('Task created & assigned to team!');
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

  exportTeamCsv(): void {
    const data = this.teams().map(t => ({
      'Team Name': t.team_name,
      'Total Tasks': t.total_tasks,
      'Completed': t.completed,
      'Rate (%)': t.completion_rate_pct,
      'Overdue': t.overdue
    }));
    this.exportService.exportToCsv('team_lead_performance', data);
  }

  exportTeamPdf(): void {
    const headers = ['Team Name', 'Total Tasks', 'Completed', 'Rate (%)', 'Overdue'];
    const rows = this.teams().map(t => [
      t.team_name,
      t.total_tasks,
      t.completed,
      `${t.completion_rate_pct}%`,
      t.overdue
    ]);
    this.exportService.exportToPdf('Team Lead Operations Report', headers, rows);
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
