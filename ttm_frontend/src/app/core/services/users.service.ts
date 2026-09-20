import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface UserManagementItem {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  role: {
    id: string;
    name: string;
  };
  manager?: {
    id: string;
    name: string;
  };
  createdAt: string;
}

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private readonly API_URL = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  getUsers(): Observable<UserManagementItem[]> {
    return this.http.get<UserManagementItem[]>(this.API_URL, { withCredentials: true });
  }

  activateUser(userId: string): Observable<any> {
    return this.http.patch(`${this.API_URL}/${userId}/activate`, {}, { withCredentials: true });
  }

  deactivateUser(userId: string): Observable<any> {
    return this.http.patch(`${this.API_URL}/${userId}/deactivate`, {}, { withCredentials: true });
  }

  createUser(payload: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/auth/register`, payload, { withCredentials: true });
  }

  getAuditLogs(): Observable<any[]> {
    return this.http.get<any[]>(`${this.API_URL}/audit-logs`, { withCredentials: true });
  }
}
