import { Routes } from '@angular/router';
import { HomeComponent } from './Home/Home';
import { LoginComponent } from './Auth/Component/Login/Login';

export const routes: Routes = [
    {
        path: '',
        component: LoginComponent,
    },
    {
        path: 'board',
        component: HomeComponent,
    },
    // {
    //     path: '/personal',
    //     component: PersonalComponent,
    // },
    // {
    //     path: '/group/:id',
    //     component: GroupComponent,
    // },
    // {
    //     path: '/group/'
    // }
];
