// auth.guard.ts
import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { LoginService } from '../Service/LoginService';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private loginService = inject(LoginService);
  private router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    return this.checkAuthState();
  }

  canActivateChild(): Observable<boolean | UrlTree> {
    return this.checkAuthState();
  }

  private checkAuthState(): Observable<boolean | UrlTree> {
    // Observable로 인증 상태 확인
    return new Observable<boolean>(observer => {
      this.loginService.checkAuthState()
        .then(isAuthenticated => {
          observer.next(isAuthenticated);
          observer.complete();
        })
        .catch(() => {
          observer.next(false);
          observer.complete();
        });
    }).pipe(
      map(isAuthenticated => {
        if (isAuthenticated) {
          return true;
        } else {
          // 로그인 페이지로 리다이렉트
          return this.router.createUrlTree(['/auth/login']);
        }
      }),
      catchError(() => {
        // 에러 발생 시 로그인 페이지로 리다이렉트
        return of(this.router.createUrlTree(['/auth/login']));
      })
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class LoginRedirectGuard implements CanActivate {
  private loginService = inject(LoginService);
  private router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    return new Observable<boolean>(observer => {
      this.loginService.checkAuthState()
        .then(isAuthenticated => {
          observer.next(isAuthenticated);
          observer.complete();
        })
        .catch(() => {
          observer.next(false);
          observer.complete();
        });
    }).pipe(
      map(isAuthenticated => {
        if (isAuthenticated) {
          // 이미 로그인된 경우 메인 페이지로 리다이렉트
          return this.router.createUrlTree(['/board']);
        } else {
          // 로그인되지 않은 경우 로그인 페이지 접근 허용
          return true;
        }
      }),
      catchError(() => {
        // 에러 발생 시 로그인 페이지 접근 허용
        return of(true);
      })
    );
  }
}