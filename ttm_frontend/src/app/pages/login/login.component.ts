import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  email = signal('');
  password = signal('');
  errorMessage = signal('');

  constructor(
    private authService: AuthService, 
    private router: Router,
    public themeService: ThemeService
  ) {}

  onSubmit(): void {
    this.authService.login({ email: this.email(), password: this.password() }).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => this.errorMessage.set(err.error?.message || 'Login failed')
    });
  }
}