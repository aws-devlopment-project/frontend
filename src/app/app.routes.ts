import { Routes } from '@angular/router';
import { MainComponent } from './Main/Main';
import { LoginComponent } from './Auth/Component/Login/Login';

export const routes: Routes = [
    {
        path: '',
        component: LoginComponent,
    },
    {
        path: 'board',
        component: MainComponent,
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
