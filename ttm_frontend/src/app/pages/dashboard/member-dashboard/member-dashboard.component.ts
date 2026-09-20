import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-member-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './member-dashboard.component.html',
  styleUrls: ['./member-dashboard.component.css']
})
export class MemberDashboardComponent implements OnInit {
  activeTab = signal<'overview' | 'tasks'>('overview');
  isSidebarCollapsed = signal<boolean>(false);

  toggleSidebar(): void {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }

  userStats = signal<any>(null);
  myTasks = signal<any[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Filtering
  dateFrom: string = '';
  dateTo: string = '';

  constructor(
    private analytics: AnalyticsService,
    public authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.fetchUserStats();
    this.fetchMyTasks();
  }

  setTab(tab: 'overview' | 'tasks'): void {
    this.activeTab.set(tab);
    if (tab === 'tasks') {
      this.fetchMyTasks();
    }
  }

  fetchUserStats(): void {
    this.loading.set(true);
    const df = this.dateFrom || undefined;
    const dt = this.dateTo || undefined;
    
    this.analytics.getUsersPerformance(1, 1, df, dt).subscribe({
      next: (res) => {
        if (res.users && res.users.length > 0) {
          this.userStats.set(res.users[0]);
        } else {
          this.userStats.set(null);
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error fetching member performance:', err);
        this.error.set('Failed to load personal performance data.');
        this.loading.set(false);
      }
    });
  }

  fetchMyTasks(): void {
    this.http.get<any[]>(`${environment.apiUrl}/tasks`, { withCredentials: true }).subscribe({
      next: (tasks) => this.myTasks.set(tasks || []),
      error: (err) => console.error('Error fetching my tasks:', err)
    });
  }

  updateTaskStatus(task: any, newStatus: string): void {
    this.http.patch(`${environment.apiUrl}/tasks/${task.id}`, { status: newStatus }, { withCredentials: true }).subscribe({
      next: (updated: any) => {
        task.status = updated.status;
        this.fetchUserStats();
      },
      error: (err) => alert(err.error?.message || 'Failed to update task status')
    });
  }

  applyFilters(): void {
    this.fetchUserStats();
  }
}
