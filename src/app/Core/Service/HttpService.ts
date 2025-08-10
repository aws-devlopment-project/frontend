import { HttpClient, HttpHeaders, HttpErrorResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { Observable, throwError } from "rxjs";
import { map } from 'rxjs/operators';
import { catchError } from 'rxjs/operators';
import { DataCacheService } from "./DataCacheService";
import { UserCredentials } from "../Models/user";

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  constructor(private http: HttpClient, private router: Router, private cacheService: DataCacheService) {}

  private handleError(error: HttpErrorResponse, originalUrl?: string): Observable<never> {
    console.error('HTTP Error:', error);
    
    let errorType = 'server';
    let errorMessage = '서버 오류가 발생했습니다.';
    let canRetry = false;

    switch (error.status) {
      case 401:
        errorType = 'auth';
        errorMessage = '인증이 필요합니다. 다시 로그인해주세요.';
        sessionStorage.removeItem('user');
        break;
      case 403:
        errorType = 'forbidden';
        errorMessage = '접근 권한이 없습니다.';
        break;
      case 404:
        errorType = 'notfound';
        errorMessage = '요청한 리소스를 찾을 수 없습니다.';
        break;
      case 0:
      case 500:
      case 502:
      case 503:
      case 504:
        errorType = 'network';
        errorMessage = '네트워크 연결을 확인해주세요.';
        canRetry = true;
        break;
      default:
        errorMessage = error.error?.message || '알 수 없는 오류가 발생했습니다.';
        canRetry = true;
    }

    // 에러 페이지로 리다이렉트
    this.router.navigate(['/error'], {
      queryParams: {
        type: errorType,
        message: encodeURIComponent(errorMessage),
        details: encodeURIComponent(JSON.stringify(error, null, 2)),
        canRetry: canRetry.toString(),
        returnUrl: originalUrl || this.router.url
      }
    });

    return throwError(() => error);
  }

  private getAuthHeaders(): HttpHeaders {
    const userObject: UserCredentials | null = this.cacheService.getCache('user');
    if (!userObject) {
      throw new Error('No authentication token found');
    }

    const token = userObject.idToken;
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  get<T = any>(url: string, customHeaders?: HttpHeaders): Observable<T> {
    try {
      const authHeaders = this.getAuthHeaders();
      const headers = customHeaders ? 
        customHeaders.set('Authorization', authHeaders.get('Authorization') || '') : 
        authHeaders;

      return this.http.get<{data: T}>(url, { headers }).pipe(
        map(response => response.data),
        catchError(error => this.handleError(error, url))
      );
    } catch (error) {
      // 토큰이 없는 경우 인증 오류로 처리
      this.router.navigate(['/error'], {
        queryParams: {
          type: 'auth',
          message: encodeURIComponent('로그인이 필요합니다.'),
          canRetry: 'false'
        }
      });
      return throwError(() => error);
    }
  }

  post<T = any>(url: string, body: any, customHeaders?: HttpHeaders): Observable<T> {
    try {
      const authHeaders = this.getAuthHeaders();
      const headers = customHeaders ? 
        customHeaders.set('Authorization', authHeaders.get('Authorization') || '') : 
        authHeaders;

      return this.http.post<T>(url, body, { headers }).pipe(
        catchError(error => this.handleError(error, url))
      );
    } catch (error) {
      // 토큰이 없는 경우 인증 오류로 처리
      this.router.navigate(['/error'], {
        queryParams: {
          type: 'auth',
          message: encodeURIComponent('로그인이 필요합니다.'),
          canRetry: 'false'
        }
      });
      return throwError(() => error);
    }
  }

  put<T = any>(url: string, body: any, customHeaders?: HttpHeaders): Observable<T> {
    try {
      const authHeaders = this.getAuthHeaders();
      const headers = customHeaders ? 
        customHeaders.set('Authorization', authHeaders.get('Authorization') || '') : 
        authHeaders;

      return this.http.put<T>(url, body, { headers }).pipe(
        catchError(error => this.handleError(error, url))
      );
    } catch (error) {
      this.router.navigate(['/error'], {
        queryParams: {
          type: 'auth',
          message: encodeURIComponent('로그인이 필요합니다.'),
          canRetry: 'false'
        }
      });
      return throwError(() => error);
    }
  }

  delete<T = any>(url: string, customHeaders?: HttpHeaders): Observable<T> {
    try {
      const authHeaders = this.getAuthHeaders();
      const headers = customHeaders ? 
        customHeaders.set('Authorization', authHeaders.get('Authorization') || '') : 
        authHeaders;

      return this.http.delete<T>(url, { headers }).pipe(
        catchError(error => this.handleError(error, url))
      );
    } catch (error) {
      this.router.navigate(['/error'], {
        queryParams: {
          type: 'auth',
          message: encodeURIComponent('로그인이 필요합니다.'),
          canRetry: 'false'
        }
      });
      return throwError(() => error);
    }
  }
}