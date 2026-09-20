import { Component, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { ManagerDashboardComponent } from './manager-dashboard/manager-dashboard.component';
import { LeadDashboardComponent } from './lead-dashboard/lead-dashboard.component';
import { MemberDashboardComponent } from './member-dashboard/member-dashboard.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    AdminDashboardComponent, 
    ManagerDashboardComponent, 
    LeadDashboardComponent, 
    MemberDashboardComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  userRole = computed(() => {
    const user = this.authService.currentUser();
    if (!user || !user.role) return '';
    return typeof user.role === 'string' ? user.role : (user.role.name || '');
  });

  constructor(
    private router: Router, 
    public authService: AuthService,
    public themeService: ThemeService
  ) {}

  ngOnInit(): void {
    // Analytics is now fetched per-component.
  }

  goToTasks(): void {
    this.router.navigate(['/tasks']);
  }

  goToRoles(): void {
    this.router.navigate(['/roles-permissions']);
  }

  logout(): void {
    this.authService.logout();
  }
}