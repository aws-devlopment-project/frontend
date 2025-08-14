import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { DataCacheService } from './DataCacheService';
import { Observable, of, firstValueFrom, throwError } from 'rxjs';
import { catchError, tap, map, timeout, retry } from 'rxjs/operators';
import { environment } from '../../../environments/environtment';

// GlobalGiving API 응답 타입 정의
export interface GlobalGivingProject {
  id: number;
  title: string;
  summary: string;
  description?: string;
  imageLink?: string;
  goal?: number;
  funding?: number;
  numberOfDonations?: number;
  themes?: {
    theme: Array<{
      id: string;
      name: string;
    }>;
  };
  organization?: {
    id: number;
    name: string;
    url?: string;
  };
  active?: boolean;
  remaining?: number;
  iso3166CountryCode?: string;
  longTermImpact?: string;
  projectLink?: string;
  endorsements?: number;
  status?: string;
  need?: string;
  fullDescription?: string;
  contactAddress?: string;
  contactCity?: string;
  contactState?: string;
  contactCountry?: string;
  contactZip?: string;
  contactUrl?: string;
  progressReportLink?: string;
  type?: string;
  modifiedDate?: string;
  image?: {
    title?: string;
    url?: string;
    imagelink?: Array<{
      url: string;
      size: string;
    }>;
  };
}

export interface GlobalGivingResponse {
  projects: {
    numberFound: number;
    project: GlobalGivingProject[];
  };
}

// 내부 DonationItem과 매핑을 위한 인터페이스
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
  globalGivingId?: number;
  projectLink?: string;
  countryCode?: string;
  remainingAmount?: number;
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
  private readonly globalGivingApiKey = environment.globalGivingApiKey || 'YOUR_API_KEY';
  private readonly globalGivingBaseUrl = 'https://api.globalgiving.org/api/public/projectservice';
  private readonly defaultProjectLimit = 20;
  private readonly apiTimeout = 10000; // 10초 타임아웃

  constructor(
    private http: HttpClient, // HttpService 대신 직접 HttpClient 사용
    private cacheService: DataCacheService
  ) {}

  // 기부 항목 목록 조회 (GlobalGiving API 사용)
  async getDonationItems(options?: {
    limit?: number;
    theme?: string;
    country?: string;
    status?: string;
  }): Promise<DonationItem[]> {
    try {
      const cacheKey = this.getCacheKey(options);
      const cache: DonationItem[] | null = this.cacheService.getCache(cacheKey);
      if (cache) {
        console.log('🔄 캐시에서 기부 항목 반환:', cache.length);
        return cache;
      }

      console.log('🌐 GlobalGiving API에서 기부 항목 조회 시작');
      
      // GlobalGiving API 호출
      const projects = await this.fetchGlobalGivingProjects(options);
      
      if (projects.length === 0) {
        console.log('⚠️ GlobalGiving API에서 프로젝트를 찾을 수 없음, Mock 데이터 사용');
        return this.getMockDonationItems();
      }

      // GlobalGiving 프로젝트를 DonationItem으로 변환
      const donationItems = this.mapGlobalGivingProjects(projects);
      
      // 캐시 저장 (5분)
      this.cacheService.setCache(cacheKey, donationItems, 300);
      
      console.log(`✅ GlobalGiving API에서 ${donationItems.length}개 기부 항목 조회 완료`);
      return donationItems;

    } catch (error) {
      console.error('❌ GlobalGiving API 호출 실패:', error);
      console.log('🔄 Mock 데이터로 대체');
      return this.getMockDonationItems();
    }
  }

  // GlobalGiving API에서 프로젝트 조회 (수정된 버전)
  private async fetchGlobalGivingProjects(options?: {
    limit?: number;
    theme?: string;
    country?: string;
    status?: string;
  }): Promise<GlobalGivingProject[]> {
    
    // API 키 검증
    if (!this.globalGivingApiKey || this.globalGivingApiKey === 'YOUR_API_KEY') {
      console.warn('⚠️ GlobalGiving API 키가 설정되지 않음. Mock 데이터를 사용합니다.');
      throw new Error('API key not configured');
    }

    const params = new URLSearchParams({
      api_key: this.globalGivingApiKey,
    });

    // 기본 파라미터 설정
    if (options?.limit) {
      params.append('maxLen', Math.min(options.limit, 50).toString());
    } else {
      params.append('maxLen', this.defaultProjectLimit.toString());
    }

    // 활성 프로젝트만 조회
    if (options?.status !== 'all') {
      params.append('status', 'active');
    }

    // 테마 필터
    if (options?.theme) {
      params.append('theme', options.theme);
    }

    // 국가 필터
    if (options?.country) {
      params.append('country', options.country);
    }

    // 정렬 기준
    params.append('sortBy', 'funding');

    const url = `${this.globalGivingBaseUrl}/all/projects?${params.toString()}`;
    
    console.log('📡 GlobalGiving API 요청 URL:', url);

    try {
      // HTTP 요청 생성 (HttpClient 직접 사용)
      const headers = new HttpHeaders({
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      });

      console.log('🔄 API 요청 시작...');

      const response = await firstValueFrom(
        this.http.get<any>(url, { headers }).pipe(
          timeout(this.apiTimeout),
          retry(2), // 최대 2번 재시도
          tap(data => {
            console.log('✅ GlobalGiving API 원시 응답:', data);
            console.log('📊 응답 타입:', typeof data);
            console.log('📋 응답 키들:', data ? Object.keys(data) : 'undefined');
          }),
          map(data => this.validateAndParseResponse(data)),
          catchError(error => {
            console.error('❌ HTTP 요청 에러:', error);
            return this.handleHttpError(error);
          })
        )
      );

      console.log('🎯 파싱된 응답:', response);
      return response.projects?.project || [];

    } catch (error) {
      console.error('❌ fetchGlobalGivingProjects 최종 에러:', error);
      throw error;
    }
  }

  // 응답 검증 및 파싱
  private validateAndParseResponse(data: any): GlobalGivingResponse {
    console.log('🔍 응답 검증 시작:', data);

    if (!data) {
      console.error('❌ 응답이 null 또는 undefined');
      throw new Error('Empty response from API');
    }

    // 응답 구조 확인
    if (typeof data !== 'object') {
      console.error('❌ 응답이 객체가 아님:', typeof data);
      throw new Error('Invalid response format');
    }

    // projects 필드 확인
    if (!data.projects) {
      console.error('❌ projects 필드가 없음. 응답 구조:', Object.keys(data));
      
      // GlobalGiving API는 때때로 다른 구조로 응답할 수 있음
      // 직접 project 배열이 올 수도 있음
      if (Array.isArray(data)) {
        console.log('🔄 응답이 배열 형태. 변환 시도...');
        return {
          projects: {
            numberFound: data.length,
            project: data
          }
        };
      }
      
      // project 필드가 직접 있는 경우
      if (data.project) {
        console.log('🔄 project 필드 발견. 변환 시도...');
        return {
          projects: {
            numberFound: Array.isArray(data.project) ? data.project.length : 1,
            project: Array.isArray(data.project) ? data.project : [data.project]
          }
        };
      }

      throw new Error('Invalid API response structure');
    }

    // projects.project 배열 확인
    if (!data.projects.project) {
      console.error('❌ projects.project 필드가 없음');
      data.projects.project = [];
    }

    if (!Array.isArray(data.projects.project)) {
      console.warn('⚠️ projects.project이 배열이 아님. 배열로 변환');
      data.projects.project = [data.projects.project];
    }

    console.log(`✅ 응답 검증 완료: ${data.projects.project.length}개 프로젝트`);
    return data as GlobalGivingResponse;
  }

  // HTTP 에러 처리
  private handleHttpError(error: any): Observable<never> {
    console.error('🚨 HTTP 에러 상세:', error);

    if (error instanceof HttpErrorResponse) {
      switch (error.status) {
        case 401:
          console.error('❌ 401 Unauthorized: API 키 확인 필요');
          break;
        case 403:
          console.error('❌ 403 Forbidden: API 사용 권한 없음');
          break;
        case 429:
          console.error('❌ 429 Too Many Requests: API 호출 한도 초과');
          break;
        case 500:
          console.error('❌ 500 Internal Server Error: 서버 오류');
          break;
        case 0:
          console.error('❌ CORS 또는 네트워크 오류');
          break;
        default:
          console.error(`❌ HTTP ${error.status}: ${error.message}`);
      }
    } else if (error.name === 'TimeoutError') {
      console.error('❌ 요청 타임아웃');
    } else {
      console.error('❌ 알 수 없는 에러:', error);
    }

    return throwError(() => error);
  }

  // GlobalGiving 프로젝트를 DonationItem으로 변환
  private mapGlobalGivingProjects(projects: GlobalGivingProject[]): DonationItem[] {
    console.log(`🔄 ${projects.length}개 프로젝트 변환 시작`);
    
    const mappedItems = projects.map((project, index) => {
      try {
        return this.mapSingleProject(project);
      } catch (error) {
        console.error(`❌ 프로젝트 ${index} 변환 실패:`, error, project);
        return null;
      }
    }).filter((item): item is DonationItem => item !== null);

    console.log(`✅ ${mappedItems.length}개 프로젝트 변환 완료`);
    return mappedItems;
  }

  private mapSingleProject(project: GlobalGivingProject): DonationItem {
    // 필수 필드 검증
    if (!project.id || !project.title) {
      throw new Error('Missing required fields: id or title');
    }

    // 이미지 URL 처리
    const imageUrl = this.getProjectImageUrl(project);
    
    // 카테고리 결정
    const category = this.determineCategory(project);
    
    // 긴급도 결정
    const urgency = this.determineUrgency(project);
    
    // 목표 금액과 현재 금액 (USD를 원화로 환산: 1 USD ≈ 1300 KRW)
    const exchangeRate = 1300;
    const targetAmount = (project.goal || project.remaining || 100) * exchangeRate;
    const currentAmount = (project.funding || 0) * exchangeRate;
    
    // 최소 기부 금액
    const minDonation = this.calculateMinDonation(targetAmount);

    return {
      id: project.id.toString(),
      title: project.title || '제목 없음',
      description: project.summary || project.description || '설명이 없습니다.',
      category,
      targetAmount,
      currentAmount,
      imageUrl,
      organizationName: project.organization?.name || '알 수 없는 기관',
      minDonation,
      urgency,
      globalGivingId: project.id,
      projectLink: project.projectLink,
      countryCode: project.iso3166CountryCode,
      remainingAmount: project.remaining ? project.remaining * exchangeRate : (targetAmount - currentAmount)
    };
  }

  // 프로젝트 이미지 URL 가져오기
  private getProjectImageUrl(project: GlobalGivingProject): string {
    // 우선순위: imageLink > image.imagelink > image.url > 기본 이미지
    if (project.imageLink) {
      return project.imageLink;
    }
    
    if (project.image?.imagelink && project.image.imagelink.length > 0) {
      // 큰 이미지를 우선적으로 사용
      const largeImage = project.image.imagelink.find(img => 
        img.size === 'large' || img.size === 'medium'
      );
      if (largeImage) {
        return largeImage.url;
      }
      return project.image.imagelink[0].url;
    }
    
    if (project.image?.url) {
      return project.image.url;
    }

    // 기본 이미지 (카테고리별)
    return this.getDefaultImageByCategory(this.determineCategory(project));
  }

  // 카테고리 결정 로직
  private determineCategory(project: GlobalGivingProject): string {
    const themes = project.themes?.theme || [];
    
    if (themes.length === 0) {
      return '기타';
    }

    // 테마 이름을 기반으로 카테고리 매핑
    for (const theme of themes) {
      const themeName = theme.name.toLowerCase();
      
      if (themeName.includes('education') || themeName.includes('school')) {
        return '교육지원';
      }
      if (themeName.includes('health') || themeName.includes('medical')) {
        return '의료지원';
      }
      if (themeName.includes('water') || themeName.includes('sanitation')) {
        return '국제개발';
      }
      if (themeName.includes('animal') || themeName.includes('wildlife')) {
        return '동물보호';
      }
      if (themeName.includes('disaster') || themeName.includes('emergency')) {
        return '재해구호';
      }
      if (themeName.includes('elderly') || themeName.includes('senior')) {
        return '노인복지';
      }
      if (themeName.includes('disability') || themeName.includes('disabled')) {
        return '장애인복지';
      }
      if (themeName.includes('environment') || themeName.includes('climate')) {
        return '환경보호';
      }
    }
    
    return '기타';
  }

  // 긴급도 결정 로직
  private determineUrgency(project: GlobalGivingProject): 'high' | 'medium' | 'low' {
    const title = project.title?.toLowerCase() || '';
    const summary = project.summary?.toLowerCase() || '';
    const themes = project.themes?.theme || [];
    
    // 긴급 키워드 체크
    const urgentKeywords = ['emergency', 'urgent', 'disaster', 'crisis', 'immediate'];
    const hasUrgentKeywords = urgentKeywords.some(keyword => 
      title.includes(keyword) || summary.includes(keyword)
    );
    
    if (hasUrgentKeywords) {
      return 'high';
    }
    
    // 재해 관련 테마인 경우
    const hasDisasterTheme = themes.some(theme => 
      theme.name.toLowerCase().includes('disaster') || 
      theme.name.toLowerCase().includes('emergency')
    );
    
    if (hasDisasterTheme) {
      return 'high';
    }
    
    // 펀딩 진행률을 기반으로 판단
    if (project.goal && project.funding) {
      const progress = project.funding / project.goal;
      if (progress < 0.3) {
        return 'medium';
      }
    }
    
    return 'low';
  }

  // 최소 기부 금액 계산
  private calculateMinDonation(targetAmount: number): number {
    // 목표 금액에 따른 최소 기부 금액 결정
    if (targetAmount <= 50000) return 1000;
    if (targetAmount <= 200000) return 2000;
    if (targetAmount <= 500000) return 5000;
    return 10000;
  }

  // 카테고리별 기본 이미지
  private getDefaultImageByCategory(category: string): string {
    const defaultImages: { [key: string]: string } = {
      '교육지원': 'https://via.placeholder.com/300x200/2196F3/FFFFFF?text=Education',
      '의료지원': 'https://via.placeholder.com/300x200/E91E63/FFFFFF?text=Medical',
      '국제개발': 'https://via.placeholder.com/300x200/4CAF50/FFFFFF?text=Development',
      '동물보호': 'https://via.placeholder.com/300x200/FF9800/FFFFFF?text=Animals',
      '재해구호': 'https://via.placeholder.com/300x200/F44336/FFFFFF?text=Disaster',
      '노인복지': 'https://via.placeholder.com/300x200/9C27B0/FFFFFF?text=Elder+Care',
      '장애인복지': 'https://via.placeholder.com/300x200/607D8B/FFFFFF?text=Disability',
      '환경보호': 'https://via.placeholder.com/300x200/8BC34A/FFFFFF?text=Environment',
      '기타': 'https://via.placeholder.com/300x200/795548/FFFFFF?text=Other'
    };
    
    return defaultImages[category] || defaultImages['기타'];
  }

  // 캐시 키 생성
  private getCacheKey(options?: any): string {
    if (!options) return 'donationItems';
    
    const keyParts = ['donationItems'];
    if (options.limit) keyParts.push(`limit:${options.limit}`);
    if (options.theme) keyParts.push(`theme:${options.theme}`);
    if (options.country) keyParts.push(`country:${options.country}`);
    if (options.status) keyParts.push(`status:${options.status}`);
    
    return keyParts.join('_');
  }

  // 특정 프로젝트 상세 정보 조회
  async getProjectDetails(projectId: string): Promise<DonationItem | null> {
    try {
      const url = `${this.globalGivingBaseUrl}/projects/collection/ids?api_key=${this.globalGivingApiKey}&projectIds=${projectId}`;
      const headers = new HttpHeaders({
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      });

      const response = await firstValueFrom(
        this.http.get<GlobalGivingResponse>(url, { headers }).pipe(
          timeout(this.apiTimeout),
          map(data => this.validateAndParseResponse(data))
        )
      );

      if (response.projects?.project?.length > 0) {
        return this.mapSingleProject(response.projects.project[0]);
      }
      
      return null;
    } catch (error) {
      console.error('프로젝트 상세 정보 조회 실패:', error);
      return null;
    }
  }

  // 테마별 프로젝트 조회
  async getProjectsByTheme(theme: string, limit: number = 10): Promise<DonationItem[]> {
    return this.getDonationItems({ theme, limit });
  }

  // 국가별 프로젝트 조회
  async getProjectsByCountry(country: string, limit: number = 10): Promise<DonationItem[]> {
    return this.getDonationItems({ country, limit });
  }

  // 기부 실행 (기존 코드 유지)
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
        this.http.post(url, body, { headers }).pipe(
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

  // 기부 내역 조회 (기존 코드 유지)
  async getDonationHistory(): Promise<DonationRecord[]> {
    try {
      const cache: DonationRecord[] | null = this.cacheService.getCache('donationHistory');
      if (cache) {
        return cache;
      }

      const url = '/api/donation/history';
      const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      
      const response = await firstValueFrom(
        this.http.get<DonationRecord[]>(url, { headers }).pipe(
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

  // Mock 데이터 (Fallback용)
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