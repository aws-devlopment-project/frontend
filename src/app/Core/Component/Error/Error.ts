import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-error',
  templateUrl: './Error.html',
  styleUrl: './Error.css'   
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