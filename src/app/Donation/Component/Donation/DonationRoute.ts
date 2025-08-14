import { Routes } from '@angular/router';
import { DonationPageComponent } from './Donation';

export const donationRoutes: Routes = [
  {
    path: '',
    component: DonationPageComponent,
    data: { title: '기부하기' }
  }
]