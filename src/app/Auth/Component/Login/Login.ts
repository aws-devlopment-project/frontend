import { Component, OnInit, signal } from "@angular/core";
import { FormBuilder, Validators, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from "@angular/router";
import { LoginService } from "../../Service/LoginService";
import { DataCacheService } from "../../../Core/Service/DataCacheService";
import { UserCredentials, UserStatus } from "../../../Core/Models/user";

@Component({
    selector: 'app-auth-login',
    templateUrl: './Login.html',
    styleUrl: './Login.css',
    imports: [ReactiveFormsModule],
    standalone: true
})
export class LoginComponent implements OnInit {
    errMsg = '';
    clickLogin = signal(true);
    successLogin = signal(true);
    signUpNextStep = signal(false);
    isLoading = signal(false);

    loginForm: FormGroup = new FormGroup({});
    emailForm: FormGroup = new FormGroup({});
    
    constructor(
        private fb: FormBuilder, 
        private auth: LoginService, 
        private router: Router,
        private cacheService: DataCacheService
    ) {}

    ngOnInit(): void {
        this.initializeForms();
        this.handleAuthCallback();
    }

    private initializeForms(): void {
        this.loginForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(8)]],
        });
        
        this.emailForm = this.fb.group({
            verificationCode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
        });
    }

    async onGoogleLogin(): Promise<void> {
        try {
            this.isLoading.update(() => true);
            await this.auth.signInWithGoogle();
        } catch (error) {
            console.error('Google 로그인 오류:', error);
            this.handleError(error);
        } finally {
            this.isLoading.update(() => false);
        }
    }

    private async handleAuthCallback(): Promise<void> {
        try {
            const isAuthenticated = await this.auth.checkAuthState();
            
            if (isAuthenticated) {
            const userInfo = await this.auth.getCurrentUserInfo();
            
            // UserCredentials 생성
            const user: UserCredentials = {
                id: userInfo.user.userId,
                name: userInfo.user.signInDetails?.loginId || 'Google User',
                accessToken: userInfo.accessToken,
            };

            const userStatus: UserStatus = {
                id: userInfo.user.userId,
                name: userInfo.user.signInDetails?.loginId || 'Google User',
                status: 'online',
                joinDate: new Date(),
                lastSeen: new Date()
            };

            this.cacheService.setCache('user', user);
            this.cacheService.setCache('userStatus', userStatus);
            
            await this.router.navigate(['/board']);
            }
        } catch (error) {
            console.error('인증 상태 확인 오류:', error);
        }
    }

    toggle(flag: boolean): void {
        this.clickLogin.update(() => flag);
        this.successLogin.update(() => true);
        this.signUpNextStep.update(() => false);
    }

    async onSubmit(event: Event): Promise<void> {
        event.preventDefault();
        
        const formElement = event.target as HTMLFormElement;
        const formId = formElement.id;

        this.isLoading.update(() => true);
        
        try {
            switch (formId) {
                case "aws-login-form":
                    await this.handleLogin();
                    break;
                case "aws-sign-up-form":
                    await this.handleSignUp();
                    break;
                case "verification-form":
                    await this.handleVerification();
                    break;
                default:
                    console.warn('Unknown form submitted:', formId);
            }
        } catch (error) {
            console.error('Form submission error:', error);
            this.handleError(error);
        } finally {
            this.isLoading.update(() => false);
        }
    }

    private async handleLogin(): Promise<void> {
        if (!this.loginForm.valid) {
            this.markFormGroupTouched(this.loginForm);
            return;
        }

        const { email, password } = this.loginForm.value;

        try {
            const res = await this.auth.signInUser(email, password);
            // const res = {
            //     status: 200,
            //     id: email,
            //     username: "철수",
            //     accessToken: "1234"
            // }

            if (res.status === 200) {
                const user : UserCredentials = {
                    id: email,
                    name: res.username,
                    accessToken: res.accessToken,
                };
                const userStatus : UserStatus = {
                    id: email,
                    name: res.username,
                    status: 'online',
                    joinDate: new Date(),
                    lastSeen: new Date()
                }
                this.cacheService.setCache('user', user);
                this.cacheService.setCache('userStatus', userStatus);
                await this.router.navigate(['/board']);
            } else {
                this.errMsg = '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.';
                this.successLogin.update(() => false);
            }
        } catch (error: any) {
            this.errMsg = error.message || '로그인 중 오류가 발생했습니다.';
            this.successLogin.update(() => false);
            throw error;
        }
    }

    private async handleSignUp(): Promise<void> {
        if (!this.loginForm.valid) {
            this.markFormGroupTouched(this.loginForm);
            return;
        }

        const { email, password } = this.loginForm.value;

        try {
            const res = await this.auth.signUpUser(email, password, email);
            this.signUpNextStep.update(() => true);
        } catch (error: any) {
            this.errMsg = error.message || '회원가입 중 오류가 발생했습니다.';
            throw error;
        }
    }

    private async handleVerification(): Promise<void> {
        if (!this.emailForm.valid) {
            this.markFormGroupTouched(this.emailForm);
            return;
        }

        const { email } = this.loginForm.value;
        const { verificationCode } = this.emailForm.value;

        try {
            const res = await this.auth.confirmUser(email, verificationCode);
            this.toggle(true);
            this.signUpNextStep.update(() => false);
        } catch (error: any) {
            this.errMsg = error.message || '인증 코드 확인 중 오류가 발생했습니다.';
            throw error;
        }
    }

    async passwordReset(): Promise<void> {
        const { email } = this.loginForm.value;
        
        if (!email) {
            this.errMsg = '비밀번호 재설정을 위해 먼저 이메일을 입력해주세요.';
            return;
        }

        try {
            this.isLoading.update(() => true);
            const result = await this.auth.requestPassswordReset(email);
            console.log("비밀번호 재설정 요청 완료:", result);
            
            // 사용자에게 이메일 확인 안내
            alert('비밀번호 재설정 링크가 이메일로 전송되었습니다.');
        } catch (error: any) {
            console.error('비밀번호 재설정 오류:', error);
            this.errMsg = '비밀번호 재설정 요청 중 오류가 발생했습니다.';
        } finally {
            this.isLoading.update(() => false);
        }
    }

    private markFormGroupTouched(formGroup: FormGroup): void {
        Object.keys(formGroup.controls).forEach(key => {
            const control = formGroup.get(key);
            control?.markAsTouched();
        });
    }

    private handleError(error: any): void {
        // 에러 타입에 따른 적절한 메시지 설정
        if (error.name === 'UserNotFoundException') {
            this.errMsg = '등록되지 않은 이메일입니다.';
        } else if (error.name === 'NotAuthorizedException') {
            this.errMsg = '이메일 또는 비밀번호가 올바르지 않습니다.';
        } else if (error.name === 'UserNotConfirmedException') {
            this.errMsg = '이메일 인증이 필요합니다.';
        } else {
            this.errMsg = error.message || '알 수 없는 오류가 발생했습니다.';
        }
        
        this.successLogin.update(() => false);
    }

    // 폼 유효성 검사를 위한 헬퍼 메서드들
    get emailControl() {
        return this.loginForm.get('email');
    }

    get passwordControl() {
        return this.loginForm.get('password');
    }

    get verificationCodeControl() {
        return this.emailForm.get('verificationCode');
    }

    onKeyPress(event: KeyboardEvent, callback: () => void): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            callback();
        }
    }
}