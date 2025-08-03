import { Injectable } from "@angular/core";
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
  AuthError
} from '@aws-amplify/auth';

@Injectable({
    providedIn: 'platform',
})
export class LoginService {
    
    async signInUser(username: string, password: string) {
        try {
            const user = await signIn({username, password});
            if (user) {
                const session = await fetchAuthSession();
                
                // 세션 유효성 검증
                if (!session.tokens?.accessToken) {
                    throw new Error('액세스 토큰을 가져올 수 없습니다.');
                }
                
                return {
                    status: 200, 
                    username: username, 
                    accessToken: session.tokens.accessToken.toString()
                };
            } else {
                return {status: 400, username: '', accessToken: ''};
            }
        } catch (error: any) {
            console.error('로그인 오류:', error);
            
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
            
            await signInWithRedirect({ 
                provider: 'Google',
                customState: JSON.stringify({
                    returnUrl: window.location.pathname
                })
            });
        } catch (error: any) {
            console.error('Google 로그인 오류:', error);
            
            // 사용자 친화적 에러 메시지
            if (error.name === 'OAuthError') {
                throw new Error('Google 인증 중 오류가 발생했습니다. 다시 시도해주세요.');
            } else if (error.name === 'ConfigurationError') {
                throw new Error('Google 로그인 설정에 문제가 있습니다. 관리자에게 문의하세요.');
            }
            
            throw new Error('Google 로그인 중 오류가 발생했습니다.');
        }
    }

    // 개선된 사용자 정보 가져오기
    async getCurrentUserInfo(): Promise<any> {
        try {
            const [user, session] = await Promise.all([
                getCurrentUser(),
                fetchAuthSession()
            ]);
            
            // 토큰 유효성 검증
            if (!session.tokens?.accessToken) {
                throw new Error('유효하지 않은 세션입니다.');
            }
            
            // 토큰 만료 확인
            const accessToken = session.tokens.accessToken;
            const tokenPayload = JSON.parse(atob(accessToken.toString().split('.')[1]));
            const isExpired = tokenPayload.exp * 1000 < Date.now();
            
            if (isExpired) {
                throw new Error('세션이 만료되었습니다.');
            }
            
            return {
                user,
                accessToken: accessToken.toString(),
                idToken: session.tokens?.idToken?.toString(),
                isAuthenticated: true,
                expiresAt: new Date(tokenPayload.exp * 1000)
            };
        } catch (error: any) {
            console.error('사용자 정보 가져오기 오류:', error);
            throw error;
        }
    }

    // 개선된 인증 상태 확인
    async checkAuthState(): Promise<boolean> {
        try {
            const user = await getCurrentUser();
            const session = await fetchAuthSession();
            
            // 토큰 존재 및 유효성 확인
            if (!session.tokens?.accessToken) {
                return false;
            }
            
            // 토큰 만료 확인
            const accessToken = session.tokens.accessToken;
            const tokenPayload = JSON.parse(atob(accessToken.toString().split('.')[1]));
            const isExpired = tokenPayload.exp * 1000 < Date.now();
            
            return !isExpired;
        } catch (error) {
            console.log('인증 상태 확인 중 오류:', error);
            return false;
        }
    }

    async signUpUser(username: string, password: string, email: string) {
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
                    },
                    autoSignIn: true,
                },
            });
            
            console.log("회원가입 결과:", { isSignUpComplete, userId, nextStep });
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
            
            console.log('이메일 인증 완료:', { isSignUpComplete, userId, nextStep });
            return { status: 200, username: username, isSignUpComplete };
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
            await signOut();
            // 로컬 저장소 정리
            this.clearLocalData();
            return { success: true };
        } catch (error: any) {
            console.error('로그아웃 오류:', error);
            throw new Error('로그아웃 중 오류가 발생했습니다.');
        }
    }

    async requestPassswordReset(username: string): Promise<ResetPasswordOutput> {
        try {
            const result = await resetPassword({ username });
            console.log('비밀번호 재설정 코드 전송:', result.nextStep);
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

            console.log('사용자 삭제 완료');

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
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
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

            console.log('로컬 데이터 정리 완료');
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
}