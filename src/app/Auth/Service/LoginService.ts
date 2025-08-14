import { Injectable } from "@angular/core";
import { DataCacheService } from "../../Core/Service/DataCacheService";
import { updatePassword, UpdatePasswordInput, updateUserAttributes } from "@aws-amplify/auth";
import { Router } from "@angular/router";

import { 
  fetchAuthSession, 
  getCurrentUser, 
  signIn, 
  signInWithRedirect, 
  signOut, 
  signUp, 
  confirmSignUp, 
  resetPassword, 
  ResetPasswordInput, 
  ResetPasswordOutput, 
  confirmResetPassword, 
  ConfirmResetPasswordInput, 
  deleteUser,
  AuthError,
  fetchUserAttributes
} from '@aws-amplify/auth';

@Injectable({
    providedIn: 'root',
})
export class LoginService {
    constructor(
        private cacheService: DataCacheService,
        private router: Router
    ) {}

    async signInUser(username: string, password: string) {
        try {
            const user = await signIn({username, password});
            if (user) {
                const session = await fetchAuthSession();
                
                // 세션 유효성 검증
                if (!session.tokens?.idToken) {
                    throw new Error('ID 토큰을 가져올 수 없습니다.');
                }
                
                // Cognito 직접 로그인이므로 fetchUserAttributes 사용 가능
                const userAttributes = await fetchUserAttributes();
                const displayName = userAttributes['custom:username'] || 
                                  userAttributes.name || 
                                  username;
                
                return {
                    status: 200, 
                    username: displayName, 
                    idToken: session.tokens.idToken.toString()
                };
            } else {
                return {status: 400, username: '', idToken: ''};
            }
        } catch (error: any) {
            
            // 에러 타입별 처리
            if (error.name === 'UserNotFoundException') {
                throw new Error('등록되지 않은 이메일입니다.');
            } else if (error.name === 'NotAuthorizedException') {
                throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
            } else if (error.name === 'UserNotConfirmedException') {
                throw new Error('이메일 인증이 필요합니다.');
            } else if (error.name === 'TooManyRequestsException') {
                throw new Error('너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요.');
            }
            
            throw new Error(error.message || '로그인 중 오류가 발생했습니다.');
        }
    }

    async signInWithGoogle(): Promise<void> {
        try {
            // 현재 URL을 저장 (리다이렉트 후 복원용)
            sessionStorage.setItem('preAuthUrl', window.location.href);
            
            return await signInWithRedirect({ 
                provider: "Google"
            });
        } catch (error: any) {

            if (error.name === 'OAuthError') {
                throw new Error('Google 인증 중 오류가 발생했습니다. 다시 시도해주세요.');
            } else if (error.name === 'ConfigurationError') {
                throw new Error('Google 로그인 설정에 문제가 있습니다. 관리자에게 문의하세요.');
            }
            
            throw new Error('Google 로그인 중 오류가 발생했습니다.');
        }
    }

    // 인증 제공자 구분 메서드
    private async getAuthProvider(): Promise<'cognito' | 'google' | 'unknown'> {
        try {
            const session = await fetchAuthSession();
            
            if (!session.tokens?.accessToken) {
                return 'unknown';
            }
            
            const tokenPayload = JSON.parse(atob(session.tokens.accessToken.toString().split('.')[1]));
            
            // Google OAuth 감지 방법들
            
            // 1. cognito:groups에 Google이 포함된 경우 (가장 확실한 방법)
            if (tokenPayload['cognito:groups'] && 
                Array.isArray(tokenPayload['cognito:groups']) && 
                tokenPayload['cognito:groups'].some((group: string) => group.includes('Google'))) {
                return 'google';
            }
            
            // 2. username이 "google_"로 시작하는 경우
            if (tokenPayload.username && tokenPayload.username.startsWith('google_')) {
                return 'google';
            }
            
            // 3. ID Token에 identities 필드가 있는 경우 (가장 신뢰할 수 있는 방법)
            if (session.tokens?.idToken) {
                const idTokenPayload = JSON.parse(atob(session.tokens.idToken.toString().split('.')[1]));
                if (idTokenPayload.identities && Array.isArray(idTokenPayload.identities)) {
                    return 'google';
                }
            }
            
            // 4. scope에 aws.cognito.signin.user.admin이 있으면 Cognito 직접 로그인
            if (tokenPayload.scope?.includes('aws.cognito.signin.user.admin')) {
                return 'cognito';
            }
            
            // 5. 위 조건들에 해당하지 않으면 Cognito 직접 로그인으로 간주
            if (tokenPayload.token_use === 'access' && tokenPayload.aud) {
                return 'cognito';
            }
            
            return 'unknown';
        } catch (error) {
            console.error('인증 제공자 확인 오류:', error);
            return 'unknown';
        }
    }

    // 개선된 사용자 정보 가져오기 - email과 name만 사용
    async getCurrentUserInfo(): Promise<any> {
        try {
            const session = await fetchAuthSession();

            if (!session.tokens?.accessToken) {
                await this.signOutUser();
                throw new Error('유효하지 않은 세션입니다.');
            }
            
            // 토큰 만료 확인
            const accessToken = session.tokens.accessToken;
            const tokenPayload = JSON.parse(atob(accessToken.toString().split('.')[1]));
            const isExpired = tokenPayload.exp * 1000 < Date.now();
            
            if (isExpired) {
                throw new Error('세션이 만료되었습니다.');
            }
            
            // 인증 제공자에 따라 다른 방식으로 사용자 정보 가져오기
            const authProvider = await this.getAuthProvider();
            
            let user, userAttributes;
            
            switch (authProvider) {
                case 'cognito':
                    // Cognito 직접 로그인: fetchUserAttributes() 사용
                    [user, userAttributes] = await Promise.all([
                        getCurrentUser(),
                        fetchUserAttributes()
                    ]);
                    break;
                    
                case 'google':
                    // Google OAuth: ID Token에서 email과 name만 추출
                    if (!session.tokens?.idToken) {
                        throw new Error('ID 토큰을 찾을 수 없습니다.');
                    }
                    
                    const idTokenPayload = JSON.parse(atob(session.tokens.idToken.toString().split('.')[1]));
                    
                    user = {
                        userId: idTokenPayload.sub,
                        username: idTokenPayload.email
                    };
                    
                    // email과 name만 사용하여 userAttributes 구성
                    userAttributes = {
                        email: idTokenPayload.email,
                        name: idTokenPayload.name,
                        // username은 Cognito 매핑에 따라 sub가 할당됨
                        username: idTokenPayload.sub
                    };
                    break;
                    
                case 'unknown':
                default:
                    // unknown인 경우 ID Token이 있으면 Google OAuth로 간주
                    if (session.tokens?.idToken) {
                        const idTokenPayload = JSON.parse(atob(session.tokens.idToken.toString().split('.')[1]));
                        
                        user = {
                            userId: idTokenPayload.sub,
                            username: idTokenPayload.email
                        };
                        
                        // email과 name만 사용
                        userAttributes = {
                            email: idTokenPayload.email,
                            name: idTokenPayload.name,
                            username: idTokenPayload.sub
                        };
                    } else {
                        // ID Token도 없으면 Cognito 직접 로그인으로 시도
                        try {
                            [user, userAttributes] = await Promise.all([
                                getCurrentUser(),
                                fetchUserAttributes()
                            ]);
                        } catch (error) {
                            console.error('Cognito fetchUserAttributes 실패:', error);
                            throw new Error(`지원하지 않는 인증 방식이거나 토큰이 유효하지 않습니다: ${authProvider}`);
                        }
                    }
                    break;
            }
            
            return {
                user,
                userAttributes,
                accessToken: accessToken.toString(),
                idToken: session.tokens?.idToken?.toString(),
                isAuthenticated: true,
                expiresAt: new Date(tokenPayload.exp * 1000),
                authProvider // 디버깅용
            };
        } catch (error: any) {
            console.error('사용자 정보 가져오기 오류:', error);
            throw error;
        }
    }

    // 개선된 인증 상태 확인
    async checkAuthState(): Promise<boolean> {
        try {
            const session = await fetchAuthSession();
            
            // 토큰 존재 확인
            if (!session.tokens?.accessToken) {
                return false;
            }
            
            // 토큰 만료 확인
            const accessToken = session.tokens.accessToken;
            const tokenPayload = JSON.parse(atob(accessToken.toString().split('.')[1]));
            const isExpired = tokenPayload.exp * 1000 < Date.now();
            
            return !isExpired;
        } catch (error) {
            return false;
        }
    }

    async signUpUser(username: string, password: string, email: string, customUsername?: string) {
        try {
            // 비밀번호 복잡성 검증
            if (!this.validatePassword(password)) {
                throw new Error('비밀번호는 8자 이상이어야 하며, 대소문자, 숫자, 특수문자를 포함해야 합니다.');
            }
            
            const { isSignUpComplete, userId, nextStep } = await signUp({
                username,
                password,
                options: {
                    userAttributes: {
                        email: email,
                        'custom:username': customUsername || username, // custom:username 추가
                    },
                    autoSignIn: true,
                },
            });
            return { success: true, userId, nextStep };
        } catch (error: any) {
            console.error('회원가입 오류:', error);
            
            if (error.name === 'UsernameExistsException') {
                throw new Error('이미 존재하는 이메일입니다.');
            } else if (error.name === 'InvalidPasswordException') {
                throw new Error('비밀번호가 정책에 맞지 않습니다.');
            } else if (error.name === 'InvalidParameterException') {
                throw new Error('입력 정보를 확인해주세요.');
            }
            
            throw new Error(error.message || '회원가입 중 오류가 발생했습니다.');
        }
    }

    async confirmUser(username: string, confirmationCode: string) {
        try {
            const { isSignUpComplete, userId, nextStep } = await confirmSignUp({ 
                username, 
                confirmationCode 
            });
            return { 
                status: 200, 
                username: username, 
                isSignUpComplete,
                nextStep // nextStep 정보도 반환
            };
        } catch (error: any) {
            console.error('이메일 인증 오류:', error);
            
            if (error.name === 'CodeMismatchException') {
                throw new Error('인증 코드가 올바르지 않습니다.');
            } else if (error.name === 'ExpiredCodeException') {
                throw new Error('인증 코드가 만료되었습니다. 새로운 코드를 요청해주세요.');
            } else if (error.name === 'LimitExceededException') {
                throw new Error('인증 시도 횟수가 초과되었습니다. 잠시 후 다시 시도해주세요.');
            }
            
            throw new Error(error.message || '이메일 인증 중 오류가 발생했습니다.');
        }
    }

    async signOutUser() {
        try {
            await signOut({global: true});
            // 로컬 저장소 정리
            this.clearLocalData();
            this.router.navigate(['/board']);
            return { success: true };
        } catch (error: any) {
            console.error('로그아웃 오류:', error);
            throw new Error('로그아웃 중 오류가 발생했습니다.');
        }
    }

    async requestPassswordReset(username: string): Promise<ResetPasswordOutput> {
        try {
            const result = await resetPassword({ username });
            return result;
        } catch (error: any) {
            console.error('비밀번호 재설정 요청 실패:', error);
            
            if (error.name === 'UserNotFoundException') {
                throw new Error('등록되지 않은 이메일입니다.');
            } else if (error.name === 'LimitExceededException') {
                throw new Error('요청 횟수가 초과되었습니다. 잠시 후 다시 시도해주세요.');
            }
            
            throw error;
        }
    }

    async confirmPasswordReset(
        username: string,
        confirmationCode: string,
        newPassword: string
    ): Promise<void> {
        try {
            // 새 비밀번호 유효성 검증
            if (!this.validatePassword(newPassword)) {
                throw new Error('비밀번호는 8자 이상이어야 하며, 대소문자, 숫자, 특수문자를 포함해야 합니다.');
            }
            
            const input: ConfirmResetPasswordInput = {
                username,
                confirmationCode,
                newPassword
            };
            await confirmResetPassword(input);
        } catch (error: any) {
            console.error('비밀번호 재설정 확인 실패:', error);
            
            if (error.name === 'CodeMismatchException') {
                throw new Error('인증 코드가 올바르지 않습니다.');
            } else if (error.name === 'ExpiredCodeException') {
                throw new Error('인증 코드가 만료되었습니다.');
            } else if (error.name === 'InvalidPasswordException') {
                throw new Error('새 비밀번호가 정책에 맞지 않습니다.');
            }
            
            throw error;
        }
    }

    async isLogin(): Promise<boolean> {
        try {
            const session = await fetchAuthSession();
            const expiration = session.credentials?.expiration;
            
            if (!expiration) {
                return false;
            }
            
            return expiration.getTime() > Date.now();
        } catch (error) {
            return false;
        }
    }

    async getToken(): Promise<string | null> {
        try {
            const session = await fetchAuthSession();
            return session.tokens?.accessToken?.toString() || null;
        } catch (error) {
            console.error('토큰 가져오기 실패:', error);
            return null;
        }
    }

    async deleteCurrentUser(): Promise<{ success: boolean; message: string }> {
        try {
            await deleteUser();
            await this.clearLocalData();

            return {
                success: true,
                message: '계정이 성공적으로 삭제되었습니다.'
            };

        } catch (error: any) {
            console.error('사용자 삭제 실패:', error);
            
            if (error.name === 'NotAuthorizedException') {
                return {
                    success: false,
                    message: '인증이 필요합니다. 다시 로그인해 주세요.'
                };
            } else if (error.name === 'UserNotFoundException') {
                return {
                    success: false,
                    message: '사용자를 찾을 수 없습니다.'
                };
            } else if (error.name === 'InvalidParameterException') {
                return {
                    success: false,
                    message: '잘못된 요청입니다.'
                };
            } else {
                return {
                    success: false,
                    message: `계정 삭제 중 오류가 발생했습니다: ${error.message}`
                };
            }
        }
    }

    // 유틸리티 메서드들
    private validatePassword(password: string): boolean {
        // 최소 8자, 대소문자, 숫자, 특수문자 포함
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/;
        return passwordRegex.test(password);
    }

    private async clearLocalData(): Promise<void> {
        try {
            // 세션 스토리지에서 인증 관련 데이터만 제거
            const keysToRemove = [
                'CognitoIdentityServiceProvider',
                'amplify-signin-with-hostedUI',
                'amplify-redirected-from-hosted-ui',
                'preAuthUrl'
            ];
            
            keysToRemove.forEach(key => {
                Object.keys(localStorage).forEach(storageKey => {
                    if (storageKey.includes(key)) {
                        localStorage.removeItem(storageKey);
                    }
                });
                Object.keys(sessionStorage).forEach(storageKey => {
                    if (storageKey.includes(key)) {
                        sessionStorage.removeItem(storageKey);
                    }
                });
            });
        } catch (error) {
            console.error('로컬 데이터 정리 실패:', error);
        }
    }

    // OAuth 리다이렉트 처리를 위한 헬퍼 메서드
    async handleOAuthRedirect(): Promise<boolean> {
        try {
            const isAuthenticated = await this.checkAuthState();
            if (isAuthenticated) {
                // 저장된 URL로 리다이렉트
                const preAuthUrl = sessionStorage.getItem('preAuthUrl');
                if (preAuthUrl && preAuthUrl !== window.location.href) {
                    sessionStorage.removeItem('preAuthUrl');
                    window.location.href = preAuthUrl;
                    return true;
                }
            }
            return isAuthenticated;
        } catch (error) {
            console.error('OAuth 리다이렉트 처리 오류:', error);
            return false;
        }
    }

    async updatePassword(oldPassword: string, newPassword: string): Promise<void> {
        try {
            // 새 비밀번호 유효성 검증
            if (!this.validatePassword(newPassword)) {
                throw new Error('비밀번호는 8자 이상이어야 하며, 대소문자, 숫자, 특수문자를 포함해야 합니다.');
            }

            const updatePasswordInput: UpdatePasswordInput = {
                oldPassword: oldPassword,
                newPassword: newPassword
            };

            await updatePassword(updatePasswordInput);
            
        } catch (error: any) {
            console.error('비밀번호 변경 실패:', error);
            
            // Amplify 에러 타입별 처리
            if (error.name === 'NotAuthorizedException') {
                throw new Error('현재 비밀번호가 올바르지 않습니다.');
            } else if (error.name === 'InvalidPasswordException') {
                throw new Error('새 비밀번호가 정책에 맞지 않습니다.');
            } else if (error.name === 'LimitExceededException') {
                throw new Error('비밀번호 변경 시도 횟수가 초과되었습니다. 잠시 후 다시 시도해주세요.');
            } else if (error.name === 'UserNotFoundException') {
                throw new Error('사용자를 찾을 수 없습니다.');
            }
            
            throw new Error(error.message || '비밀번호 변경 중 오류가 발생했습니다.');
        }
    }

    async updateCustomUsername(newUsername: string): Promise<boolean> {
        try {
            await updateUserAttributes({
                userAttributes: {
                    'custom:username': newUsername
                }
            });

            return true;
        } catch (e) {
            console.error('Error updating custom username: ', e);
            throw e;
        }
    }

    async getCurrentUserAttributes() {
        try {
            const authProvider = await this.getAuthProvider();
            
            if (authProvider === 'cognito') {
            return await fetchUserAttributes();
            } else {
            // Google OAuth의 경우 ID Token에서 정보 추출
            const session = await fetchAuthSession();
            if (session.tokens?.idToken) {
                const idTokenPayload = JSON.parse(atob(session.tokens.idToken.toString().split('.')[1]));
                return {
                email: idTokenPayload.email,
                name: idTokenPayload.name,
                // Google OAuth에서는 custom:username이 없으므로 name 사용
                };
            }
            throw new Error('ID Token not found');
            }
        } catch (error) {
            console.error('Error fetching user attributes:', error);
            throw error;
        }
    }

    async getCustomUsername(): Promise<string | null> {
    try {
        const session = await fetchAuthSession();
        const authProvider = await this.getAuthProvider();
        
        switch (authProvider) {
        case 'cognito':
            // Cognito 직접 로그인: fetchUserAttributes() 사용 가능
            const attributes = await fetchUserAttributes();
            return attributes['custom:username'] || null;
            
        case 'google':
            // Google OAuth: ID Token에서 name 사용 (custom:username 없음)
            if (session.tokens?.idToken) {
            const idTokenPayload = JSON.parse(atob(session.tokens.idToken.toString().split('.')[1]));
            return idTokenPayload.name || idTokenPayload.email?.split('@')[0] || null;
            }
            return null;
            
        default:
            // Unknown인 경우 ID Token이 있으면 Google로 간주
            if (session.tokens?.idToken) {
            const idTokenPayload = JSON.parse(atob(session.tokens.idToken.toString().split('.')[1]));
            return idTokenPayload.name || idTokenPayload.email?.split('@')[0] || null;
            } else {
            // ID Token이 없으면 Cognito로 시도
            const attributes = await fetchUserAttributes();
            return attributes['custom:username'] || null;
            }
        }
    } catch (error) {
        console.error('Error fetching custom username:', error);
        return null;
    }
    }
}