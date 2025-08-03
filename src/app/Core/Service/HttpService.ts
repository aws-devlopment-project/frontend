import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { Observable, throwError } from "rxjs";
import { catchError } from 'rxjs/operators';

@Injectable({
    providedIn: 'root',
})
export class HttpService {
    constructor(private http: HttpClient, private router: Router) {}

    private handleUnauthorized(): void {
        sessionStorage.removeItem('user');
        this.router.navigate(['/']);
    }

    get<T = any>(url: string, headers?: HttpHeaders): Observable<T> {
        const userObject = sessionStorage.getItem('user');
        if (!userObject) {
            this.handleUnauthorized();
            return throwError('No token found');
        }
        const token = JSON.parse(userObject).accessToken;
        headers?.append('Authorization', `Bearer ${token}`);
        return this.http.get<T>(url, { headers }).pipe(
            catchError(error => {
                console.log(error);
                this.handleUnauthorized();
                return throwError(error);
            })
        );
    }

    post<T=any>(url: string, body: any, headers?: HttpHeaders) : Observable<T> {
        const userObject = sessionStorage.getItem('user');
        if (!userObject) {
            this.handleUnauthorized();
            return throwError('No token found');
        }
        const token = JSON.parse(userObject).accessToken;
        headers?.append('Authorization', `Bearer ${token}`);
        return this.http.post<T>(url, body, { headers }).pipe(
            catchError(error => {
                console.log(error);
                this.handleUnauthorized();
                return throwError(error);
            })
    )}
}