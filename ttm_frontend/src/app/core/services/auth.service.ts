import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { 
  Observable, 
  tap, 
  catchError, 
  throwError, 
  BehaviorSubject, 
  filter, 
  take, 
  switchMap, 
  map, 
  of 
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = `${environment.apiUrl}/auth`;

  // Tokens stored strictly IN-MEMORY via Angular Signals
  readonly currentUser = signal<User | null>(null);
  readonly accessToken = signal<string | null>(null);
  readonly isAuthenticated = computed(() => !!this.accessToken());

  // Prevent multiple simultaneous refresh calls (Race condition lock)
  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  constructor(private http: HttpClient, private router: Router) {}

  login(credentials: any): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/login`, credentials, { withCredentials: true }).pipe(
      tap((res) => {
        if (res.accessToken) {
          this.accessToken.set(res.accessToken);
          const user = res.user;
          if (user && typeof user.role === 'string') {
            user.role = { id: '', name: user.role };
          }
          this.currentUser.set(user);
        }
      })
    );
  }

  refreshToken(): Observable<{ accessToken: string }> {
    if (this.isRefreshing) {
      // If a refresh is already in progress, wait until it completes and return the new token
      return this.refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap((token) => new Observable<{ accessToken: string }>((subscriber) => {
          subscriber.next({ accessToken: token! });
          subscriber.complete();
        }))
      );
    } else {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return this.http.post<{ accessToken: string }>(`${this.API_URL}/refresh`, {}, { withCredentials: true }).pipe(
        tap((res) => {
          this.isRefreshing = false;
          this.accessToken.set(res.accessToken);
          this.refreshTokenSubject.next(res.accessToken);
        }),
        catchError((err) => {
          this.isRefreshing = false;
          this.clearSession(false);
          return throwError(() => err);
        })
      );
    }
  }

  logout(): void {
    this.http.post(`${this.API_URL}/logout`, {}, { withCredentials: true }).subscribe({
      next: () => this.clearSession(),
      error: () => this.clearSession()
    });
  }

  fetchProfile(): Observable<User> {
    return this.http.get<User>(`${this.API_URL}/me`, { withCredentials: true }).pipe(
      tap((user) => {
        if (user && typeof user.role === 'string') {
          user.role = { id: '', name: user.role };
        }
        this.currentUser.set(user);
      })
    );
  }

  /**
   * Called once during app initialization (APP_INITIALIZER) to restore session via HttpOnly cookie
   */
  initSession(): Observable<boolean> {
    return this.refreshToken().pipe(
      switchMap(() => this.fetchProfile()),
      map(() => true),
      catchError(() => {
        // If refresh fails (no cookie/session expired), clear state cleanly without throwing
        this.accessToken.set(null);
        this.currentUser.set(null);
        return of(false);
      })
    );
  }

  private clearSession(navigate: boolean = true): void {
    this.accessToken.set(null);
    this.currentUser.set(null);
    if (navigate) {
      this.router.navigate(['/login']);
    }
  }
}