import { Injectable } from '@angular/core';
import { HttpService } from './HttpService';
import { DataCacheService } from './DataCacheService';
import { HttpHeaders } from '@angular/common/http';
import { Observable, of, firstValueFrom } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export interface DonationItem {
  id: string;
  title: string;
  description: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  imageUrl: string;
  organizationName: string;
  minDonation: number;
  endDate?: Date;
  urgency: 'high' | 'medium' | 'low';
}

export interface DonationRecord {
  id: string;
  donationItemId: string;
  amount: number;
  donationDate: Date;
  status: 'completed' | 'pending' | 'failed';
  transactionId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DonationService {
  constructor(
    private httpService: HttpService,
    private cacheService: DataCacheService
  ) {}

  // 기부 항목 목록 조회
  async getDonationItems(): Promise<DonationItem[]> {
    try {
      const cache: DonationItem[] | null = this.cacheService.getCache('donationItems');
      if (cache) {
        return cache;
      }

      const url = '/api/donation/items';
      const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      
      const response = await firstValueFrom(
        this.httpService.get<DonationItem[]>(url, () => this.getMockDonationItems(), headers).pipe(
          tap(data => {
            this.cacheService.setCache('donationItems', data, 300); // 5분 캐시
          }),
          catchError(error => {
            console.error('[API] getDonationItems error:', error);
            return of(this.getMockDonationItems());
          })
        )
      );

      return response;
    } catch (error) {
      console.error('[API] getDonationItems failed:', error);
      return this.getMockDonationItems();
    }
  }

  // 기부 실행
  async makeDonation(donationItemId: string, amount: number, paymentMethod: string = 'points'): Promise<boolean> {
    try {
      const url = '/api/donation/donate';
      const body = {
        donationItemId,
        amount,
        paymentMethod,
        timestamp: new Date().toISOString()
      };
      const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

      await firstValueFrom(
        this.httpService.post(url, body, headers).pipe(
          tap(() => {
            // 캐시 무효화
            this.cacheService.removeCache('donationItems');
            this.cacheService.removeCache('donationHistory');
          }),
          catchError(error => {
            console.error('[API] makeDonation error:', error);
            throw error;
          })
        )
      );

      return true;
    } catch (error) {
      console.error('[API] makeDonation failed:', error);
      return false;
    }
  }

  // 기부 내역 조회
  async getDonationHistory(): Promise<DonationRecord[]> {
    try {
      const cache: DonationRecord[] | null = this.cacheService.getCache('donationHistory');
      if (cache) {
        return cache;
      }

      const url = '/api/donation/history';
      const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      
      const response = await firstValueFrom(
        this.httpService.get<DonationRecord[]>(url, () => [], headers).pipe(
          tap(data => {
            this.cacheService.setCache('donationHistory', data);
          }),
          catchError(error => {
            console.error('[API] getDonationHistory error:', error);
            return of([]);
          })
        )
      );

      return response;
    } catch (error) {
      console.error('[API] getDonationHistory failed:', error);
      return [];
    }
  }

  // 목업 데이터
  private getMockDonationItems(): DonationItem[] {
    return [
      {
        id: '1',
        title: '아프리카 식수 지원 프로젝트',
        description: '깨끗한 물을 마실 수 없는 아프리카 어린이들에게 희망을 전해주세요.',
        category: '국제개발',
        targetAmount: 10000000,
        currentAmount: 7500000,
        imageUrl: 'https://via.placeholder.com/300x200/4CAF50/FFFFFF?text=Water+Project',
        organizationName: '월드비전',
        minDonation: 1000,
        endDate: new Date('2025-12-31'),
        urgency: 'high'
      },
      {
        id: '2',
        title: '독거노인 식사 지원',
        description: '홀로 지내시는 어르신들의 따뜻한 한 끼를 책임져 주세요.',
        category: '노인복지',
        targetAmount: 5000000,
        currentAmount: 3200000,
        imageUrl: 'https://via.placeholder.com/300x200/FF9800/FFFFFF?text=Elder+Care',
        organizationName: '대한적십자사',
        minDonation: 500,
        urgency: 'medium'
      },
      {
        id: '3',
        title: '유기견 보호소 운영비 지원',
        description: '버려진 반려동물들이 새로운 가족을 만날 때까지 보호해 주세요.',
        category: '동물보호',
        targetAmount: 3000000,
        currentAmount: 1800000,
        imageUrl: 'https://via.placeholder.com/300x200/2196F3/FFFFFF?text=Animal+Shelter',
        organizationName: '동물사랑실천협회',
        minDonation: 2000,
        urgency: 'medium'
      },
      {
        id: '4',
        title: '소아암 환아 치료비 지원',
        description: '힘든 투병생활을 이어가고 있는 어린이들에게 희망을 선물해 주세요.',
        category: '의료지원',
        targetAmount: 20000000,
        currentAmount: 12500000,
        imageUrl: 'https://via.placeholder.com/300x200/E91E63/FFFFFF?text=Child+Cancer',
        organizationName: '소아암재단',
        minDonation: 1000,
        urgency: 'high'
      },
      {
        id: '5',
        title: '장애인 재활 프로그램 지원',
        description: '장애인분들의 사회복귀를 위한 재활 프로그램을 지원해주세요.',
        category: '장애인복지',
        targetAmount: 8000000,
        currentAmount: 4200000,
        imageUrl: 'https://via.placeholder.com/300x200/9C27B0/FFFFFF?text=Rehabilitation',
        organizationName: '한국장애인복지관',
        minDonation: 1500,
        urgency: 'low'
      }
    ];
  }
}