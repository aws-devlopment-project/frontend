import { Injectable } from "@angular/core";
import { fetchAuthSession, getCurrentUser, signIn, signInWithRedirect, signOut, signUp, confirmSignUp, resetPassword, ResetPasswordInput, ResetPasswordOutput, confirmResetPassword, ConfirmResetPasswordInput } from '@aws-amplify/auth';

@Injectable({
    providedIn: 'platform',
})
export class LoginService {
    async signInUser(username: string, password: string) {
        try {
            const user = await signIn({username, password});
            if (user) {
                const currentUser = await getCurrentUser();
                console.log(currentUser);
                const session = await fetchAuthSession();
                return {status: 200, username: username, accessToken: session.tokens?.accessToken?.toString()};
            } else {
                return {status: 400, username: '', accessToken: ''};
            }
        } catch (error) {
            return {status: 500, username: '', accessToken: ''};
        }
    }

    async signInWithGoogle() : Promise<void> {
        try {
            await signInWithRedirect();
        } catch (e) {
            console.log(e);
        }
    }

    async signUpUser(username: string, password: string, email: string) {
        try {
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
            console.log("회원가입 결과:", isSignUpComplete, userId, nextStep);
            return true;
        } catch (error) {
            return error;
        }
    }

    async confirmUser(username: string, confirmationCode: string) {
        try {
            const { isSignUpComplete, userId, nextStep} = await confirmSignUp({ username, confirmationCode});
            console.log(userId);
            return { status: 200, username: username};
        } catch(e) {
            return false;
        }
    }

    async signOutUser() {
        return await signOut();
    }

    async requestPassswordReset(username: string): Promise<ResetPasswordOutput> {
        try {
            const result = await resetPassword({username});
            console.log('Password reset code sent to:', result.nextStep);
            return result;
        } catch (error) {
            console.error('Failed to request password reset:', error);
            throw error;
        }
    }

    async confirmPasswordReset(
        username: string,
        confirmationCode: string,
        newPassword: string
    ): Promise<void> {
        try {
            const input: ConfirmResetPasswordInput = {
                username,
                confirmationCode,
                newPassword
            };
            await confirmResetPassword(input);
        } catch (e) {
            console.error('Failed to confirm password reset:', e);
            throw e;
        }
    }

    async resendConfirmationCode(username: string): Promise<ResetPasswordOutput> {
        try {
            const result = await resetPassword({username});
            console.log('Confirmation code resent');
            return result;
        } catch (error) {
            console.error('Failed to resend code:', error);
            throw error;
        }
    }
}