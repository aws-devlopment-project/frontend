import { Component, OnInit, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Subject, takeUntil } from 'rxjs';
import { DonationService, DonationItem } from '../../../Donation/Service/DonationService';
import { DonationPointsService } from '../../../Donation/Service/DontaionPointService';
import { SharedStateService } from '../../../Core/Service/SharedService';
import { LocalActivityService } from '../../../DashBoard/Service/LocalActivityService';
import { environment } from '../../../../environments/environtment';

@Component({
  selector: 'app-donation-page',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    MatCardModule, 
    MatButtonModule, 
    MatProgressBarModule,
    MatDialogModule,
    MatSnackBarModule,
    MatIconModule,
    MatSelectModule,
    MatInputModule,
    MatFormFieldModule
  ],
  templateUrl: './Donation.html',
  styleUrls: ['./Donation.css']
})
export class DonationPageComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  // Signals
  donationItems = signal<DonationItem[]>([]);
  donationHistory = signal<any[]>([]);
  selectedItem = signal<DonationItem | null>(null);
  selectedCategory = signal<string>('전체');
  selectedTheme = signal<string>('all');
  selectedCountry = signal<string>('all');
  isLoading = signal<boolean>(true);
  hasError = signal<boolean>(false);
  isProcessing = signal<boolean>(false);
  isRefreshing = signal<boolean>(false);
  isLoadingMore = signal<boolean>(false);
  
  constructor(
    private donationService: DonationService,
    private pointsService: DonationPointsService,
    private sharedService: SharedStateService,
    private activityService: LocalActivityService,
    private snackBar: MatSnackBar
  ) {}

  // Form data
  donationAmount = 0;
  sortBy = 'urgency';
  searchTerm = '';
  currentLimit = environment.donation.defaultLimit;
  isThemeDropdownOpen = false;
  isCountryDropdownOpen = false;
  isSortDropdownOpen = false;
  
  // Categories (기존 + GlobalGiving 테마 기반)
  categories = ['전체', '교육지원', '의료지원', '국제개발', '동물보호', '재해구호', '노인복지', '장애인복지', '환경보호', '기타'];
  
  // GlobalGiving 테마 옵션
  themeOptions = [
    { value: 'all', label: '모든 테마' },
    { value: 'education', label: '교육' },
    { value: 'health', label: '보건/의료' },
    { value: 'water', label: '식수/위생' },
    { value: 'animals', label: '동물보호' },
    { value: 'disaster', label: '재해구호' },
    { value: 'environment', label: '환경보호' },
    { value: 'human-rights', label: '인권' },
    { value: 'economic-development', label: '경제개발' }
  ];
  
  // 국가 옵션 (주요 아시아 국가)
  countryOptions = [
    { value: 'all', label: '모든 국가' },
    { value: 'KR', label: '한국' },
    { value: 'US', label: '미국' },
    { value: 'IN', label: '인도' },
    { value: 'BD', label: '방글라데시' },
    { value: 'NP', label: '네팔' },
    { value: 'PH', label: '필리핀' },
    { value: 'VN', label: '베트남' },
    { value: 'TH', label: '태국' },
    { value: 'MM', label: '미얀마' },
    { value: 'KH', label: '캄보디아' }
  ];
  
  // Computed values
  userPoints = computed(() => this.pointsService.userPoints());
  
  filteredItems = computed(() => {
    let items = this.donationItems();
    
    // 검색어 필터
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase();
      items = items.filter(item => 
        item.title.toLowerCase().includes(searchLower) ||
        item.description.toLowerCase().includes(searchLower) ||
        item.organizationName.toLowerCase().includes(searchLower)
      );
    }
    
    // 카테고리 필터
    if (this.selectedCategory() !== '전체') {
      items = items.filter(item => item.category === this.selectedCategory());
    }
    
    // 정렬
    switch (this.sortBy) {
      case 'urgency':
        const urgencyOrder = { high: 3, medium: 2, low: 1 };
        items = items.sort((a, b) => urgencyOrder[b.urgency] - urgencyOrder[a.urgency]);
        break;
      case 'progress':
        items = items.sort((a, b) => this.getProgressPercentage(b) - this.getProgressPercentage(a));
        break;
      case 'amount':
        items = items.sort((a, b) => b.targetAmount - a.targetAmount);
        break;
      case 'remaining':
        items = items.sort((a, b) => {
          if (!a.endDate || !b.endDate) return 0;
          return a.endDate.getTime() - b.endDate.getTime();
        });
        break;
      case 'newest':
        items = items.sort((a, b) => (b.globalGivingId || 0) - (a.globalGivingId || 0));
        break;
    }
    
    return items;
  });

  // 통계 정보
  totalProjects = computed(() => this.donationItems().length);
  totalFunding = computed(() => 
    this.donationItems().reduce((sum, item) => sum + item.currentAmount, 0)
  );
  averageProgress = computed(() => {
    const items = this.donationItems();
    if (items.length === 0) return 0;
    const totalProgress = items.reduce((sum, item) => sum + this.getProgressPercentage(item), 0);
    return Math.round(totalProgress / items.length);
  });
  
  async ngOnInit() {
    // 활동 추적
    this.activityService.trackActivity(
      'page_visit',
      '기부 페이지 방문',
      'GlobalGiving API를 통한 실제 기부 프로젝트를 탐색합니다.'
    );
    
    await this.loadDonationItems();
    await this.loadDonationHistory();
    document.addEventListener('click', this.onDocumentClick.bind(this));
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('click', this.onDocumentClick.bind(this));
  }
  
  async loadDonationItems(loadMore: boolean = false) {
    if (loadMore) {
      this.isLoadingMore.set(true);
    } else {
      this.isLoading.set(true);
      this.hasError.set(false);
    }
    
    try {
      const options = {
        limit: loadMore ? this.currentLimit + 10 : this.currentLimit,
        theme: this.selectedTheme() !== 'all' ? this.selectedTheme() : undefined,
        country: this.selectedCountry() !== 'all' ? this.selectedCountry() : undefined
      };

      console.log('🔄 기부 항목 로딩 시작:', options);
      
      const items = await this.donationService.getDonationItems(options);
      
      if (loadMore) {
        this.currentLimit += 10;
      }
      
      this.donationItems.set(items);
      
      // 성공 메시지 (처음 로딩시에만)
      if (!loadMore && items.length > 0) {
        const hasGlobalGivingData = items.some(item => item.globalGivingId);
        if (hasGlobalGivingData) {
          this.snackBar.open(
            `GlobalGiving에서 ${items.length}개의 실제 기부 프로젝트를 불러왔습니다! 🌍`, 
            '확인', 
            { duration: 4000 }
          );
        }
      }
      
    } catch (error) {
      console.error('Failed to load donation items:', error);
      this.hasError.set(true);
      this.snackBar.open('기부 항목을 불러오는데 실패했습니다.', '확인', {
        duration: 3000
      });
    } finally {
      this.isLoading.set(false);
      this.isLoadingMore.set(false);
    }
  }

  async loadDonationHistory() {
    try {
      const history = await this.donationService.getDonationHistory();
      this.donationHistory.set(history);
    } catch (error) {
      console.error('Failed to load donation history:', error);
    }
  }

  async refreshPoints() {
    this.isRefreshing.set(true);
    try {
      await this.pointsService.refreshPoints();
      this.snackBar.open('포인트가 새로고침되었습니다.', '확인', {
        duration: 2000
      });
    } catch (error) {
      console.error('Failed to refresh points:', error);
      this.snackBar.open('포인트 새로고침에 실패했습니다.', '확인', {
        duration: 3000
      });
    } finally {
      this.isRefreshing.set(false);
    }
  }

  // 필터 관련 메서드
  setSelectedCategory(category: string) {
    this.selectedCategory.set(category);
  }

  async onSearchChange() {
    // 검색은 클라이언트 사이드에서 처리 (실시간)
    console.log('🔍 검색어 변경:', this.searchTerm);
  }

  // 더 많은 프로젝트 로드
  async loadMoreProjects() {
    await this.loadDonationItems(true);
  }

  // 기존 메서드들
  openDonationDialog(item: DonationItem) {
    this.selectedItem.set(item);
    this.donationAmount = item.minDonation;
    
    // 기부 항목 조회 활동 추적
    this.activityService.trackActivity(
      'quest_view',
      '기부 항목 조회',
      `${item.title} 기부 항목을 자세히 살펴봤습니다.`,
      { 
        donationItem: item.title, 
        category: item.category,
        globalGivingId: item.globalGivingId,
        organizationName: item.organizationName
      }
    );
  }
  
  closeDonationDialog() {
    this.selectedItem.set(null);
    this.donationAmount = 0;
  }
  
  setDonationAmount(amount: number) {
    if (amount <= this.userPoints()) {
      this.donationAmount = amount;
    }
  }
  
  getQuickAmounts(): number[] {
    const baseAmounts = [1000, 5000, 10000, 20000, 50000];
    const userPointsValue = this.userPoints();
    
    return baseAmounts.filter(amount => amount <= userPointsValue);
  }
  
  isValidDonation(): boolean {
    const item = this.selectedItem();
    if (!item) return false;
    
    return this.donationAmount >= item.minDonation && 
           this.donationAmount <= this.userPoints() &&
           this.donationAmount > 0;
  }
  
  async processDonation() {
    if (!this.isValidDonation() || !this.selectedItem()) return;
    
    const item = this.selectedItem()!;
    this.isProcessing.set(true);
    
    try {
      // 포인트 차감
      const pointsDeducted = await this.pointsService.deductPoints(
        this.donationAmount, 
        `${item.title} 기부`
      );
      
      if (!pointsDeducted) {
        throw new Error('포인트 차감에 실패했습니다.');
      }
      
      // 기부 실행
      const success = await this.donationService.makeDonation(
        item.id, 
        this.donationAmount, 
        'points'
      );
      
      if (success) {
        // 성공 처리
        const isGlobalGivingProject = item.globalGivingId ? '🌍 ' : '';
        this.snackBar.open(
          `${isGlobalGivingProject}${this.donationAmount.toLocaleString()}P가 성공적으로 기부되었습니다! 🎉`, 
          '확인', 
          { duration: 5000 }
        );
        
        // 활동 추적
        this.activityService.trackActivity(
          'quest_complete',
          '기부 완료',
          `${item.title}에 ${this.donationAmount.toLocaleString()}P를 기부했습니다.`,
          { 
            donationItem: item.title, 
            amount: this.donationAmount,
            category: item.category,
            globalGivingId: item.globalGivingId,
            organizationName: item.organizationName
          }
        );
        
        // 데이터 새로고침
        await Promise.all([
          this.loadDonationItems(),
          this.loadDonationHistory()
        ]);
        
        this.closeDonationDialog();
      } else {
        // 실패 시 포인트 복구
        await this.pointsService.addPoints(this.donationAmount, '기부 실패 복구');
        throw new Error('기부 처리에 실패했습니다.');
      }
      
    } catch (error) {
      console.error('Donation failed:', error);
      this.snackBar.open(
        error instanceof Error ? error.message : '기부에 실패했습니다.', 
        '확인', 
        { duration: 3000 }
      );
    } finally {
      this.isProcessing.set(false);
    }
  }

  // 프로젝트 상세 정보 보기
  async viewProjectDetails(item: DonationItem) {
    if (item.projectLink) {
      window.open(item.projectLink, '_blank');
    } else if (item.globalGivingId) {
      window.open(`https://www.globalgiving.org/projects/${item.globalGivingId}/`, '_blank');
    }
    
    // 외부 링크 접근 추적
    this.activityService.trackActivity(
      'search_action',
      '프로젝트 상세 조회',
      `${item.title}의 상세 정보를 확인했습니다.`,
      { globalGivingId: item.globalGivingId }
    );
  }
  
  // 유틸리티 메서드들
  getProgressPercentage(item: DonationItem): number {
    return Math.min(Math.round((item.currentAmount / item.targetAmount) * 100), 100);
  }
  
  getRemainingAmount(item: DonationItem): number {
    return Math.max(item.targetAmount - item.currentAmount, 0);
  }
  
  getDaysRemaining(endDate: Date): number {
    const today = new Date();
    const timeDiff = endDate.getTime() - today.getTime();
    return Math.max(Math.ceil(timeDiff / (1000 * 3600 * 24)), 0);
  }
  
  getDonationItemTitle(itemId: string): string {
    const item = this.donationItems().find(item => item.id === itemId);
    return item ? item.title : '알 수 없는 항목';
  }

  // 프로젝트가 GlobalGiving에서 온 것인지 확인
  isGlobalGivingProject(item: DonationItem): boolean {
    return !!item.globalGivingId;
  }

  // 카테고리별 아이콘 반환
  getCategoryIcon(category: string): string {
    const icons: { [key: string]: string } = {
      '교육지원': 'school',
      '의료지원': 'local_hospital',
      '국제개발': 'public',
      '동물보호': 'pets',
      '재해구호': 'emergency',
      '노인복지': 'elderly',
      '장애인복지': 'accessible',
      '환경보호': 'eco',
      '기타': 'category'
    };
    return icons[category] || 'category';
  }

  // 국가 코드를 국가명으로 변환
  getCountryName(countryCode?: string): string {
    if (!countryCode) return '';
    
    const country = this.countryOptions.find(opt => opt.value === countryCode);
    return country ? country.label : countryCode;
  }

  // 드롭다운 토글 메서드들
  toggleThemeDropdown() {
    this.isThemeDropdownOpen = !this.isThemeDropdownOpen;
    this.isCountryDropdownOpen = false;
    this.isSortDropdownOpen = false;
  }

  toggleCountryDropdown() {
    this.isCountryDropdownOpen = !this.isCountryDropdownOpen;
    this.isThemeDropdownOpen = false;
    this.isSortDropdownOpen = false;
  }

  toggleSortDropdown() {
    this.isSortDropdownOpen = !this.isSortDropdownOpen;
    this.isThemeDropdownOpen = false;
    this.isCountryDropdownOpen = false;
  }

  // 외부 클릭시 드롭다운 닫기
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-select')) {
      this.closeAllDropdowns();
    }
  }

  closeAllDropdowns() {
    this.isThemeDropdownOpen = false;
    this.isCountryDropdownOpen = false;
    this.isSortDropdownOpen = false;
  }

  // 선택 메서드들
  selectTheme(theme: string) {
    this.selectedTheme.set(theme);
    this.isThemeDropdownOpen = false;
    this.onThemeChange();
  }

  selectCountry(country: string) {
    this.selectedCountry.set(country);
    this.isCountryDropdownOpen = false;
    this.onCountryChange();
  }

  selectSort(sort: string) {
    this.sortBy = sort;
    this.isSortDropdownOpen = false;
    this.onSortChange();
  }

  // 라벨 가져오기 메서드들
  getSelectedThemeLabel(): string {
    const theme = this.themeOptions.find(t => t.value === this.selectedTheme());
    return theme ? theme.label : '모든 테마';
  }

  getSelectedCountryLabel(): string {
    const country = this.countryOptions.find(c => c.value === this.selectedCountry());
    return country ? country.label : '모든 국가';
  }

  getSortLabel(): string {
    const sortLabels: { [key: string]: string } = {
      'urgency': '긴급도순',
      'progress': '진행률순',
      'amount': '목표금액순',
      'newest': '최신순',
      'remaining': '마감임박순'
    };
    return sortLabels[this.sortBy] || '긴급도순';
  }

  // 아이콘 가져오기 메서드들
  getThemeIcon(): string {
    const themeIcons: { [key: string]: string } = {
      'all': 'category',
      'education': 'school',
      'health': 'local_hospital',
      'water': 'water_drop',
      'animals': 'pets',
      'disaster': 'emergency',
      'environment': 'eco',
      'human-rights': 'gavel',
      'economic-development': 'trending_up'
    };
    return themeIcons[this.selectedTheme()] || 'category';
  }

  getThemeOptionIcon(theme: string): string {
    const themeIcons: { [key: string]: string } = {
      'all': 'category',
      'education': 'school',
      'health': 'local_hospital',
      'water': 'water_drop',
      'animals': 'pets',
      'disaster': 'emergency',
      'environment': 'eco',
      'human-rights': 'gavel',
      'economic-development': 'trending_up'
    };
    return themeIcons[theme] || 'category';
  }

  getCountryIcon(): string {
    return this.selectedCountry() === 'all' ? 'public' : 'flag';
  }

  getSortIcon(): string {
    const sortIcons: { [key: string]: string } = {
      'urgency': 'priority_high',
      'progress': 'trending_up',
      'amount': 'attach_money',
      'newest': 'new_releases',
      'remaining': 'schedule'
    };
    return sortIcons[this.sortBy] || 'priority_high';
  }

  // 국가 플래그 이모지 가져오기
  getCountryFlag(countryCode: string): string {
    const flags: { [key: string]: string } = {
      'all': '🌍',
      'KR': '🇰🇷',
      'US': '🇺🇸',
      'IN': '🇮🇳',
      'BD': '🇧🇩',
      'NP': '🇳🇵',
      'PH': '🇵🇭',
      'VN': '🇻🇳',
      'TH': '🇹🇭',
      'MM': '🇲🇲',
      'KH': '🇰🇭'
    };
    return flags[countryCode] || '🏳️';
  }

  // 활성 필터 확인
  hasActiveFilters(): boolean {
    return this.selectedCategory() !== '전체' ||
           this.selectedTheme() !== 'all' ||
           this.selectedCountry() !== 'all' ||
           this.searchTerm.trim() !== '';
  }

  // 필터 초기화 (기존 메서드 업데이트)
  async resetFilters() {
    this.selectedCategory.set('전체');
    this.selectedTheme.set('all');
    this.selectedCountry.set('all');
    this.searchTerm = '';
    this.sortBy = 'urgency';
    this.currentLimit = environment.donation.defaultLimit;
    
    // 드롭다운도 닫기
    this.closeAllDropdowns();
    
    await this.loadDonationItems();
    
    this.snackBar.open('모든 필터가 초기화되었습니다! 🔄', '확인', {
      duration: 2000
    });
  }

  // 기존 메서드들도 드롭다운 닫기 추가
  async onThemeChange() {
    console.log('🎯 테마 변경:', this.selectedTheme());
    this.closeAllDropdowns();
    await this.loadDonationItems();
  }

  async onCountryChange() {
    console.log('🌍 국가 변경:', this.selectedCountry());
    this.closeAllDropdowns();
    await this.loadDonationItems();
  }

  async onSortChange() {
    console.log('📊 정렬 변경:', this.sortBy);
    this.closeAllDropdowns();
    // 정렬은 computed에서 자동으로 처리됨
  }
}