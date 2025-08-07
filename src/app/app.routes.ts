import { Routes } from '@angular/router';
import { MainComponent } from './Main/Main';
import { LoginComponent } from './Auth/Component/Login/Login';
import { GroupJoinComponent } from './DashBoard/Component/GroupJoin/GroupJoin';
import { ErrorPageComponent } from './Core/Component/Error/Error';

export const routes: Routes = [
    {
        path: '',
        component: LoginComponent,
    },
    {
        path: 'board',
        component: MainComponent,
    },
    {
        path: 'group/join',
        component: GroupJoinComponent
    },
    {
        path: 'error',
        component: ErrorPageComponent
    },
    { 
        path: '**', 
        redirectTo: '/error',
    }
];
