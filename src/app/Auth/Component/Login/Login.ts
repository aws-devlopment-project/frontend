import { Component, OnInit, signal } from "@angular/core";
import { FormBuilder, Validators, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from "@angular/router";
import { fetchAuthSession } from '@aws-amplify/auth';
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
    loadingType = signal<'signin' | 'signup' | 'verification' | 'google' | 'password-reset' | 'auto-signin'>('signin');
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

    currentUsername: string = '';
    newUsername: string = '';
    isUpdating: boolean = false;
    
    constructor(
        private fb: FormBuilder, 
        private auth: LoginService, 
        private router: Router,
        private cacheService: DataCacheService
    ) {}

    ngOnInit(): void {
        this.initializeForms();
        this.handleAuthCallback();
        this.loadCurrentUsername();
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

    // 로딩 제목 반환
    getLoadingTitle(): string {
        switch (this.loadingType()) {
            case 'signin':
                return '로그인 중...';
            case 'signup':
                return '회원가입 중...';
            case 'verification':
                return '인증 확인 중...';
            case 'google':
                return 'Google 로그인 중...';
            case 'password-reset':
                return '비밀번호 재설정 중...';
            case 'auto-signin':
                return '자동 로그인 중...';
            default:
                return '처리 중...';
        }
    }

    // 로딩 메시지 반환
    getLoadingMessage(): string {
        switch (this.loadingType()) {
            case 'signin':
                return '계정 정보를 확인하고 있습니다...';
            case 'signup':
                return '계정을 생성하고 있습니다...';
            case 'verification':
                return '인증 코드를 확인하고 있습니다...';
            case 'google':
                return 'Google로 리다이렉트 중입니다...';
            case 'password-reset':
                return '비밀번호 재설정 이메일을 발송 중입니다...';
            case 'auto-signin':
                return '자동 로그인을 완료하고 있습니다...';
            default:
                return '잠시만 기다려주세요...';
        }
    }

    // 로딩 상태 설정 헬퍼 메서드
    private setLoading(type: 'signin' | 'signup' | 'verification' | 'google' | 'password-reset' | 'auto-signin', loading: boolean): void {
        this.loadingType.set(type);
        this.isLoading.set(loading);
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
            
            // autoSignIn이 완료되기를 기다림
            if (res.nextStep?.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
                
                // 잠시 기다린 후 인증 상태 확인
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const isAuthenticated = await this.auth.checkAuthState();
                
                if (isAuthenticated) {
                    // 자동 로그인 성공 - 사용자 정보 처리
                    await this.handleSuccessfulAuth();
                    return;
                }
            }
            
            // 일반적인 경우 - 로그인 화면으로 이동
            this.toggle(true);
            this.signUpNextStep.update(() => false);
            
        } catch (error: any) {
            this.errMsg = error.message || '인증 코드 확인 중 오류가 발생했습니다.';
            throw error;
        }
    }

    // 성공적인 인증 후 처리 로직을 별도 메서드로 분리
    private async handleSuccessfulAuth(): Promise<void> {
        try {
            // 직접 session에서 토큰 가져오기
            const session = await fetchAuthSession();
            const idToken = session.tokens?.idToken?.toString();
            
            if (!idToken) {
                console.error('AccessToken not found in session');
                return;
            }
            
            const userInfo = await this.auth.getCurrentUserInfo();
            
            // Google OAuth인 경우와 일반 회원가입 구분
            let displayName: string;
            let userId: string;
            
            if (userInfo.authProvider === 'google') {
                // Google OAuth
                displayName = userInfo.userAttributes?.name || 
                            userInfo.userAttributes?.email?.split('@')[0] || 
                            'User';
                userId = userInfo.userAttributes?.email || userInfo.user.userId;
            } else {
                // 일반 Cognito 회원가입
                displayName = userInfo.userAttributes?.['custom:username'] || 
                            userInfo.userAttributes?.name || 
                            userInfo.userAttributes?.email?.split('@')[0] || 
                            'User';
                userId = userInfo.userAttributes?.email || userInfo.user.userId;
            }

            const user: UserCredentials = {
                id: userId,
                name: displayName,
                idToken: idToken,
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
            
        } catch (error) {
            console.error('인증 성공 후 처리 오류:', error);
            // 오류 발생 시 로그인 화면으로 이동
            this.toggle(true);
            this.signUpNextStep.update(() => false);
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
        return this.clickLogin() ? this.signInForm.get('email') : this.signUpForm.get('email');
    }

    get passwordControl() {
        return this.clickLogin() ? this.signInForm.get('password') : this.signUpForm.get('password');
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
        // 로컬에서 사용 시 try 내부 코드에서 주석 처리된 코드를 활성화 해주시고 기존에 활성화된 코드는 주석 처리해주세요
        try {
            const isAuthenticated = await this.auth.checkAuthState();
            
            if (isAuthenticated) {
                await this.handleSuccessfulAuth();
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
            // const res = {
            //     status: 200,
            //     id: "admin@nameless.com",
            //     username: "admin",
            //     idToken: "adminToken"
            // }
            const res = await this.auth.signInUser(email, password);

            if (res.status === 200) {
                const user: UserCredentials = {
                    id: email,
                    name: res.username,
                    idToken: res.idToken
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

    async loadCurrentUsername() {
        try {
            const username = await this.auth.getCustomUsername();
            this.currentUsername = username || '';
        } catch (error) {
        console.error('Failed to load username:', error);
        }
    }

    async updateUsername() {
        if (!this.newUsername.trim()) {
            alert('Please enter a valid username');
            return;
        }

        this.isUpdating = true;
        
        try {
            await this.auth.updateCustomUsername(this.newUsername);
            this.currentUsername = this.newUsername;
            this.newUsername = '';
        } catch (error) {
            console.error('Failed to update username:', error);
        } finally {
            this.isUpdating = false;
        }
    }
}