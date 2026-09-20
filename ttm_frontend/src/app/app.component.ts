import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  constructor(private readonly authService: AuthService) {}

  ngOnInit(): void {
    // Attempt silent session restoration on app load using the HttpOnly cookie
    this.authService.refreshToken().subscribe({
      next: () => {
        // Access token successfully placed in Signal memory; hydrate user profile
        this.authService.fetchProfile().subscribe({
          error: (err) => console.error('Failed to load user profile:', err)
        });
      },
      error: () => {
        // No active session cookie or token expired—user will remain unauthenticated
      }
    });
  }
}