import { Component, OnInit, signal } from "@angular/core";
import { FormBuilder, Validators, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from "@angular/router";
import { LoginService } from "../../Service/LoginService";

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

    loginForm: FormGroup = new FormGroup({});
    emailForm: FormGroup = new FormGroup({});
    constructor(private fb: FormBuilder, private auth: LoginService, private router: Router) {
    }

    ngOnInit(): void {
        this.loginForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', Validators.required],
        });
        this.emailForm = this.fb.group({
            verificationCode: ['', [Validators.required, Validators.minLength(6)]]
        })
    }

    toggle(flag: boolean): void {
        this.clickLogin.update((value) => value = flag);
    }

    async onSubmit(event: Event): Promise<void> {
        const formElement = event.target as HTMLFormElement;
        const formId = formElement.id;
        if (formId === "aws-login-form") {
            const { email, password } = this.loginForm.value;

            await this.auth.signInUser(email, password)
                .then((res) => {
                    if (res.status === 200) {
                        sessionStorage.setItem('user', JSON.stringify({
                            username: res.username,
                            accessToken: res.accessToken
                        }));
                        this.router.navigate(['/board']);
                    } else {
                        this.errMsg = '로그인 실패';
                        console.log(this.errMsg);
                        this.successLogin.update((value) => value = false);
                    }
                })
                .catch((error) => {
                    this.errMsg = error.message || '로그인 실패';
                    console.log(error.message);
                });
        } else if (formId === "aws-sign-up-form") {
            const { email, password } = this.loginForm.value;

            const res = await this.auth.signUpUser(email, password, email);
            console.log("SignUpResult: " + res);
        } else {
            const { email, _ } = this.loginForm.value;
            const { verificationCode } = this.emailForm.value;

            const res = await this.auth.confirmUser(email, verificationCode);
        }
    }

    async passwordReset(): Promise<void> {
        const { email, _ } = this.loginForm.value;
        try {
            const result = await this.auth.requestPassswordReset(email);
        } catch (e) {
            console.log(e);
        }
    }
}