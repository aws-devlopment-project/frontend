import { Routes } from '@angular/router';
import { MainComponent } from './Main/Main';
import { LoginComponent } from './Auth/Component/Login/Login';
import { GroupJoinComponent } from './DashBoard/Component/GroupJoin/GroupJoin';

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
    }
];
