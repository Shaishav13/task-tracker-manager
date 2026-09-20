import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private readonly ANALYTICS_URL = 'http://localhost:8000/analytics/performance';

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.accessToken?.() || localStorage.getItem('accessToken');
    let headers = new HttpHeaders();
    if (token && token !== 'null' && token !== 'undefined') {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  getSampleMetrics(dateFrom?: string, dateTo?: string): Observable<any> {
    let params = new HttpParams();
    if (dateFrom) params = params.set('date_from', dateFrom);
    if (dateTo) params = params.set('date_to', dateTo);

    return this.http.get(`${this.ANALYTICS_URL}/sample`, { 
      headers: this.getHeaders(),
      params 
    });
  }

  getManagersPerformance(page: number = 1, pageSize: number = 20, dateFrom?: string, dateTo?: string): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());
      
    if (dateFrom) params = params.set('date_from', dateFrom);
    if (dateTo) params = params.set('date_to', dateTo);

    return this.http.get(`${this.ANALYTICS_URL}/managers`, { 
      headers: this.getHeaders(),
      params 
    });
  }

  getTeamsPerformance(page: number = 1, pageSize: number = 20, dateFrom?: string, dateTo?: string): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());
      
    if (dateFrom) params = params.set('date_from', dateFrom);
    if (dateTo) params = params.set('date_to', dateTo);

    return this.http.get(`${this.ANALYTICS_URL}/teams`, { 
      headers: this.getHeaders(),
      params 
    });
  }

  getUsersPerformance(page: number = 1, pageSize: number = 20, dateFrom?: string, dateTo?: string): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());
      
    if (dateFrom) params = params.set('date_from', dateFrom);
    if (dateTo) params = params.set('date_to', dateTo);

    return this.http.get(`${this.ANALYTICS_URL}/users`, { 
      headers: this.getHeaders(),
      params 
    });
  }

  getExecutiveSummary(dateFrom?: string, dateTo?: string): Observable<any> {
    let params = new HttpParams();
    if (dateFrom) params = params.set('date_from', dateFrom);
    if (dateTo) params = params.set('date_to', dateTo);

    return this.http.get(`${this.ANALYTICS_URL}/executive`, {
      headers: this.getHeaders(),
      params
    });
  }

  getRecentTasks(limit: number = 20): Observable<any> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get(`${this.ANALYTICS_URL}/recent-tasks`, {
      headers: this.getHeaders(),
      params
    });
  }
}
