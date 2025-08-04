import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-error',
  template: `
    <div class="error-container">
      <div class="error-card">
        <div class="error-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/>
            <path d="M15 9l-6 6" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
            <path d="M9 9l6 6" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        
        <h1 class="error-title">{{ errorTitle }}</h1>
        <p class="error-message">{{ errorMessage }}</p>
        
        <div class="error-details" *ngIf="errorDetails">
          <details>
            <summary>상세 정보</summary>
            <pre>{{ errorDetails }}</pre>
          </details>
        </div>
        
        <div class="error-actions">
          <button class="btn-primary" (click)="goToLogin()">
            로그인으로 이동
          </button>
          <button class="btn-secondary" (click)="goHome()">
            홈으로 이동
          </button>
          <button class="btn-secondary" (click)="retry()" *ngIf="canRetry">
            다시 시도
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .error-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }

    .error-card {
      background: white;
      border-radius: 12px;
      padding: 40px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      max-width: 500px;
      width: 100%;
    }

    .error-icon {
      margin-bottom: 24px;
      display: flex;
      justify-content: center;
    }

    .error-title {
      font-size: 28px;
      font-weight: bold;
      color: #1f2937;
      margin-bottom: 16px;
    }

    .error-message {
      font-size: 16px;
      color: #6b7280;
      margin-bottom: 32px;
      line-height: 1.6;
    }

    .error-details {
      margin-bottom: 32px;
      text-align: left;
    }

    .error-details summary {
      cursor: pointer;
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .error-details pre {
      background: #f3f4f6;
      padding: 12px;
      border-radius: 6px;
      font-size: 12px;
      color: #374151;
      overflow-x: auto;
      max-height: 200px;
      overflow-y: auto;
    }

    .error-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .btn-primary, .btn-secondary {
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      font-size: 14px;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover {
      background: #2563eb;
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
    }

    .btn-secondary:hover {
      background: #e5e7eb;
      transform: translateY(-1px);
    }

    @media (max-width: 480px) {
      .error-card {
        padding: 24px;
      }
      
      .error-title {
        font-size: 24px;
      }
      
      .error-actions {
        flex-direction: column;
      }
      
      .btn-primary, .btn-secondary {
        width: 100%;
      }
    }
  `]
})
export class ErrorPageComponent implements OnInit {
  errorTitle: string = '오류가 발생했습니다';
  errorMessage: string = '요청을 처리하는 중 문제가 발생했습니다.';
  errorDetails: string = '';
  canRetry: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    // URL 파라미터에서 에러 정보 읽기
    this.route.queryParams.subscribe(params => {
      if (params['type']) {
        this.setErrorByType(params['type']);
      }
      if (params['message']) {
        this.errorMessage = decodeURIComponent(params['message']);
      }
      if (params['details']) {
        this.errorDetails = decodeURIComponent(params['details']);
      }
      this.canRetry = params['canRetry'] === 'true';
    });
  }

  private setErrorByType(type: string) {
    switch (type) {
      case 'auth':
        this.errorTitle = '인증 오류';
        this.errorMessage = '로그인이 필요하거나 세션이 만료되었습니다.';
        break;
      case 'network':
        this.errorTitle = '네트워크 오류';
        this.errorMessage = '서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.';
        this.canRetry = true;
        break;
      case 'server':
        this.errorTitle = '서버 오류';
        this.errorMessage = '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        this.canRetry = true;
        break;
      case 'forbidden':
        this.errorTitle = '접근 권한 없음';
        this.errorMessage = '이 페이지에 접근할 권한이 없습니다.';
        break;
      case 'notfound':
        this.errorTitle = '페이지를 찾을 수 없음';
        this.errorMessage = '요청하신 페이지가 존재하지 않습니다.';
        break;
      default:
        this.errorTitle = '알 수 없는 오류';
        this.errorMessage = '예상치 못한 오류가 발생했습니다.';
    }
  }

  goToLogin() {
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }

  goHome() {
    this.router.navigate(['/']);
  }

  retry() {
    const returnUrl = this.route.snapshot.queryParams['returnUrl'];
    if (returnUrl) {
      this.router.navigateByUrl(returnUrl);
    } else {
      window.location.reload();
    }
  }
}