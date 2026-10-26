import { Component, signal, OnInit, OnDestroy } from '@angular/core';
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
export class LoginComponent implements OnInit, OnDestroy {
  email = signal('');
  password = signal('');
  errorMessage = signal('');
  isSubmitting = signal(false);
  isWakingUp = signal(false);
  private wakeUpTimer: any = null;

  constructor(
    private authService: AuthService, 
    private router: Router,
    public themeService: ThemeService
  ) {}

  ngOnInit(): void {
    // Non-blocking ping to pre-warm the backend cloud server while the user fills out the form
    this.authService.warmupBackend();
  }

  ngOnDestroy(): void {
    if (this.wakeUpTimer) {
      clearTimeout(this.wakeUpTimer);
    }
  }

  onSubmit(): void {
    if (this.isSubmitting()) return;
    this.errorMessage.set('');
    this.isSubmitting.set(true);
    this.isWakingUp.set(false);

    // If server takes more than 2 seconds (Render cold start), provide reassuring feedback
    this.wakeUpTimer = setTimeout(() => {
      if (this.isSubmitting()) {
        this.isWakingUp.set(true);
      }
    }, 2000);

    this.authService.login({ email: this.email(), password: this.password() }).subscribe({
      next: () => {
        this.cleanupState();
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.cleanupState();
        this.errorMessage.set(err.error?.message || 'Login failed. Please verify your credentials.');
      }
    });
  }

  private cleanupState(): void {
    this.isSubmitting.set(false);
    this.isWakingUp.set(false);
    if (this.wakeUpTimer) {
      clearTimeout(this.wakeUpTimer);
    }
  }
}