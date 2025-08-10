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
    showPassword = signal(false);

    // 비밀번호 강도 관련 시그널
    passwordStrength = signal<'weak' | 'medium' | 'strong'>('weak');
    passwordRequirements = signal({
        minLength: false,
        hasLowercase: false,
        hasUppercase: false,
        hasNumber: false,
        hasSpecialChar: false
    });
    showPasswordRequirements = signal(false);

    signInForm: FormGroup = new FormGroup({});
    signUpForm: FormGroup = new FormGroup({});
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
        this.signInForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(8)]],
        });

        this.signUpForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(8)]],
            username: ['', [Validators.required, Validators.maxLength(20)]]
        });

        // 비밀번호 실시간 검증 추가
        this.signUpForm.get('password')?.valueChanges.subscribe(password => {
            if (password) {
                this.validatePasswordStrength(password);
                this.showPasswordRequirements.set(true);
            } else {
                this.showPasswordRequirements.set(false);
            }
        });
        
        this.emailForm = this.fb.group({
            verificationCode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
        });
    }

    // 비밀번호 강도 실시간 검증
    private validatePasswordStrength(password: string): void {
        const requirements = {
            minLength: password.length >= 8,
            hasLowercase: /[a-z]/.test(password),
            hasUppercase: /[A-Z]/.test(password),
            hasNumber: /\d/.test(password),
            hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
        };

        this.passwordRequirements.set(requirements);

        // 강도 계산
        const passedRequirements = Object.values(requirements).filter(Boolean).length;
        
        if (passedRequirements < 3) {
            this.passwordStrength.set('weak');
        } else if (passedRequirements < 5) {
            this.passwordStrength.set('medium');
        } else {
            this.passwordStrength.set('strong');
        }
    }

    // 비밀번호 요구사항 완성도 계산
    get passwordCompletionPercentage(): number {
        const requirements = this.passwordRequirements();
        const completed = Object.values(requirements).filter(Boolean).length;
        return Math.round((completed / 5) * 100);
    }

    // 비밀번호 보기/숨기기 토글
    togglePasswordVisibility(): void {
        this.showPassword.update(current => !current);
    }

    // HTML에서 사용할 동적 FormGroup getter
    get loginForm(): FormGroup {
        return this.clickLogin() ? this.signInForm : this.signUpForm;
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

    private async handleSignUp(): Promise<void> {
        if (!this.signUpForm.valid) {
            this.markFormGroupTouched(this.signUpForm);
            return;
        }

        const { email, password, username } = this.signUpForm.value;

        try {
            const res = await this.auth.signUpUser(email, password, email, username);
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

        const { email } = this.signUpForm.value;
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
        const { email } = this.signInForm.value;
        
        if (!email) {
            this.errMsg = '비밀번호 재설정을 위해 먼저 이메일을 입력해주세요.';
            return;
        }

        try {
            this.isLoading.update(() => true);
            const result = await this.auth.requestPassswordReset(email);
            console.log("비밀번호 재설정 요청 완료:", result);
            
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

    get emailControl() {
        return this.loginForm.get('email');
    }

    get passwordControl() {
        return this.loginForm.get('password');
    }

    get usernameControl() {
        return this.signUpForm.get('username');
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

    private async handleAuthCallback(): Promise<void> {
        try {
            // 로컬 사용 시, try 내부 코드를 전부 주석 처리하고 이 주석의 코드를 활성화하세요
            /*
            let userId = "wefwefw@wefewfwe.fwwefwefwef";
            let displayName = "wewefwefwefwef";
            const user: UserCredentials = {
                id: userId,
                name: displayName,
                accessToken: userInfo.accessToken,
            };

            const userStatus: UserStatus = {
                id: userId,
                name: displayName,
                status: 'online',
                joinDate: new Date(),
                lastSeen: new Date()
            };
            this.cacheService.setCache('user', user);
            this.cacheService.setCache('userStatus', userStatus);
            
            await this.router.navigate(['/board']);
            */
            const isAuthenticated = await this.auth.checkAuthState();
            
            if (isAuthenticated) {
                const userInfo = await this.auth.getCurrentUserInfo();
                
                // Google OAuth인 경우 email과 name을 사용하여 displayName 생성
                let displayName: string;
                let userId: string;
                
                if (userInfo.authProvider === 'google') {
                    // Google OAuth: name을 우선 사용, 없으면 email의 @ 앞부분 사용
                    displayName = userInfo.userAttributes?.name || 
                                userInfo.userAttributes?.email?.split('@')[0] || 
                                'User';
                    // Google OAuth: email을 userId로 사용
                    userId = userInfo.userAttributes?.email || userInfo.user.userId;
                } else {
                    // Cognito 직접 로그인: custom:username -> name -> email 순으로 사용
                    displayName = userInfo.userAttributes?.['custom:username'] || 
                                userInfo.userAttributes?.name || 
                                userInfo.userAttributes?.email || 
                                'User';
                    // Cognito 직접 로그인: email을 userId로 사용 (있으면), 없으면 기본 userId
                    userId = userInfo.userAttributes?.email || userInfo.user.userId;
                }

                const user: UserCredentials = {
                    id: userId,
                    name: displayName,
                    accessToken: userInfo.accessToken,
                };

                const userStatus: UserStatus = {
                    id: userId,
                    name: displayName,
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
        if (!this.signInForm.valid) {
            this.markFormGroupTouched(this.signInForm);
            return;
        }

        const { email, password } = this.signInForm.value;

        try {
            const res = {
                status: 200,
                id: "admin@nameless.com",
                username: "admin",
                accessToken: "adminToken"
            }
            // const res = await this.auth.signInUser(email, password);

            if (res.status === 200) {
                const user: UserCredentials = {
                    id: email,
                    name: res.username,
                    accessToken: res.accessToken,
                };
                const userStatus: UserStatus = {
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
}