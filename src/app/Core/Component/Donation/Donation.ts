import { Component, OnInit, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { DonationService, DonationItem } from '../../Service/DonationService';
import { DonationPointsService } from '../../Service/DontaionPointService';
import { SharedStateService } from '../../Service/SharedService';
import { LocalActivityService } from '../../../DashBoard/Service/LocalActivityService';

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
    MatIconModule
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
  isLoading = signal<boolean>(true);
  hasError = signal<boolean>(false);
  isProcessing = signal<boolean>(false);
  isRefreshing = signal<boolean>(false);
  
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
  
  // Categories
  categories = ['전체', '국제개발', '노인복지', '동물보호', '의료지원', '장애인복지'];
  
  // Computed values
  userPoints = computed(() => this.pointsService.userPoints());
  
  filteredItems = computed(() => {
    let items = this.donationItems();
    
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
    }
    
    return items;
  });
  
  async ngOnInit() {
    // 활동 추적
    this.activityService.trackActivity(
      'page_visit',
      '기부 페이지 방문',
      '기부 페이지를 방문하여 나눔을 실천하려고 합니다.'
    );
    
    await this.loadDonationItems();
    await this.loadDonationHistory();
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  async loadDonationItems() {
    this.isLoading.set(true);
    this.hasError.set(false);
    
    try {
      const items = await this.donationService.getDonationItems();
      this.donationItems.set(items);
    } catch (error) {
      console.error('Failed to load donation items:', error);
      this.hasError.set(true);
      this.snackBar.open('기부 항목을 불러오는데 실패했습니다.', '확인', {
        duration: 3000
      });
    } finally {
      this.isLoading.set(false);
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
  
  setSelectedCategory(category: string) {
    this.selectedCategory.set(category);
  }
  
  sortItems() {
    // 정렬은 computed에서 자동으로 처리됨
  }
  
  openDonationDialog(item: DonationItem) {
    this.selectedItem.set(item);
    this.donationAmount = item.minDonation;
    
    // 기부 항목 조회 활동 추적
    this.activityService.trackActivity(
      'quest_view',
      '기부 항목 조회',
      `${item.title} 기부 항목을 자세히 살펴봤습니다.`,
      { donationItem: item.title, category: item.category }
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
        this.snackBar.open(
          `${this.donationAmount.toLocaleString()}P가 성공적으로 기부되었습니다! 🎉`, 
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
            category: item.category 
          }
        );
        
        // 데이터 새로고침
        await Promise.all([
          this.loadDonationItems(),
          this.loadDonationHistory()
        ]);
        
        this.closeDonationDialog();
      } else {
        // 실패 시 포인트 복구 (필요시)
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
}