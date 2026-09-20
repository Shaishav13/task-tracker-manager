import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ThemeService } from '../../core/services/theme.service';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assignedTo?: { name: string; email: string };
  createdBy?: { name: string; email: string };
  createdAt: string;
}

import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tasks.component.html',
  styleUrl: './tasks.component.css'
})
export class TasksComponent implements OnInit {
  private readonly API_URL = `${environment.apiUrl}/tasks`;

  tasks = signal<Task[]>([]);
  isModalOpen = signal<boolean>(false);
  isLoading = signal<boolean>(false);

  // Form State
  newTask = {
    title: '',
    description: '',
    priority: 'MEDIUM',
    status: 'TODO'
  };

  constructor(
    private http: HttpClient, 
    private router: Router,
    public themeService: ThemeService
  ) {}

  ngOnInit(): void {
    this.fetchTasks();
  }

  fetchTasks(): void {
    this.isLoading.set(true);
    this.http.get<Task[]>(this.API_URL, { withCredentials: true }).subscribe({
      next: (data) => {
        this.tasks.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load tasks:', err);
        this.isLoading.set(false);
      }
    });
  }

  openCreateModal(): void {
    this.isModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isModalOpen.set(false);
    this.newTask = { title: '', description: '', priority: 'MEDIUM', status: 'TODO' };
  }

  createTask(): void {
    if (!this.newTask.title.trim()) return;

    this.http.post<Task>(this.API_URL, this.newTask, { withCredentials: true }).subscribe({
      next: (createdTask) => {
        // Optimistically append the newly created task to the list signal
        this.tasks.update((prev) => [createdTask, ...prev]);
        this.closeCreateModal();
      },
      error: (err) => {
        console.error('Failed to create task:', err);
      }
    });
  }

  backToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}