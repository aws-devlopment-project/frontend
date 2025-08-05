// Main.ts - 개선된 버전
import { Component, OnInit, OnDestroy, effect, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { DebugService } from "../Debug/DebugService";

import { SideBarComponent } from "../Core/Component/SideBar/SideBar";
import { HeaderBarComponent } from "../Core/Component/HeaderBar/HeaderBar";
import { GroupDashboardComponent } from "../DashBoard/Component/GroupDashboard/GroupDashboard";
import { HomeDashboardComponent } from "../DashBoard/Component/HomeDashboard/HomeDashboard";
import { MainContainerComponent } from "../Channel/Component/MainContainer/MainContainer";
import { MemberOptionsComponent } from "../DashBoard/Component/MemberDashboard/MemberDashboard";
import { ActivityDashboardComponent } from "../DashBoard/Component/ActivityDashboard/ActivityDashboard";
import { SharedStateService } from "../Core/Service/SharedService";
import { environment } from "../../environments/environtment";

@Component({
  selector: 'app-main',
  templateUrl: './Main.html',
  styleUrl: './Main.css',
  imports: [
    CommonModule,
    SideBarComponent,
    HeaderBarComponent,
    GroupDashboardComponent,
    HomeDashboardComponent,
    MainContainerComponent,
    MemberOptionsComponent,
    ActivityDashboardComponent
  ],
  standalone: true
})
export class MainComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Environment 객체를 템플릿에서 사용할 수 있도록 노출
  readonly environment = environment;

  // Computed signals for template usage
  readonly isLoading = computed(() => this.sharedState.isLoading());
  readonly hasError = computed(() => this.sharedState.error() !== null);
  readonly errorMessage = computed(() => this.sharedState.error());
  readonly isInitialized = computed(() => this.sharedState.initialized());
  readonly hasValidData = computed(() => this.sharedState.hasValidData());

  constructor(public sharedState: SharedStateService, private debugService: DebugService) {
    this.debugService.printConsole('MainComponent initialized with SharedStateService');
    
    // 초기화 상태 모니터링
    effect(() => {
      const initialized = this.sharedState.initialized();
      const hasData = this.sharedState.hasValidData();
      const error = this.sharedState.error();
      
      this.debugService.printConsole('MainComponent state:', {
        initialized,
        hasData,
        error,
        activeTab: this.sharedState.activeTab(),
        selectedGroup: this.sharedState.selectedGroup(),
        selectedChannel: this.sharedState.selectedChannel()
      });
    });

    // 에러 상태 모니터링
    effect(() => {
      const error = this.sharedState.error();
      if (error) {
        this.debugService.printConsole('MainComponent detected error:', error);
        this.handleError(error);
      }
    });

    // 로딩 상태 모니터링
    effect(() => {
      const loading = this.sharedState.isLoading();
      this.debugService.printConsole('MainComponent loading state:', loading);
    });
  }

  ngOnInit(): void {
    this.debugService.printConsole('MainComponent ngOnInit');
    
    // 컴포넌트가 완전히 초기화된 후 추가 설정
    setTimeout(() => {
      this.checkInitializationStatus();
    }, 0);
  }

  ngOnDestroy(): void {
    this.debugService.printConsole('MainComponent ngOnDestroy');
    this.destroy$.next();
    this.destroy$.complete();
  }

  // === 초기화 상태 확인 ===
  private checkInitializationStatus(): void {
    if (!this.sharedState.initialized()) {
      this.debugService.printConsole('SharedState not initialized, waiting...');
      return;
    }

    if (!this.sharedState.hasValidData()) {
      this.debugService.printConsole('SharedState initialized but missing valid data');
      this.handleMissingData();
      return;
    }

    this.debugService.printConsole('MainComponent fully initialized with valid data');
  }

  // === 에러 처리 ===
  private handleError(error: string): void {
    // 사용자에게 에러 표시 (토스트, 모달 등)
    this.debugService.printConsole('Handling error in MainComponent:', error);
    
    // 필요에 따라 특정 에러에 대한 처리
    if (error.includes('사용자 정보')) {
      // 사용자 정보 에러 처리
      this.handleUserError();
    } else if (error.includes('가입 목록')) {
      // 가입 목록 에러 처리
      this.handleJoinListError();
    }
  }

  private handleUserError(): void {
    this.debugService.printConsole('Handling user error - may redirect to profile setup');
    // 사용자 프로필 설정 페이지로 이동하거나 재시도 옵션 제공
  }

  private handleJoinListError(): void {
    this.debugService.printConsole('Handling join list error - may show join group options');
    // 그룹 가입 페이지로 이동하거나 새로고침 옵션 제공
  }

  // === 데이터 부족 처리 ===
  private handleMissingData(): void {
    this.debugService.printConsole('Handling missing data situation');
    
    if (!this.sharedState.currentUser()) {
      this.debugService.printConsole('Missing user data');
      // 사용자 정보 재로드 시도
      this.retryUserDataLoad();
    }

    if (!this.sharedState.userJoinList()) {
      this.debugService.printConsole('Missing join list data');
      // 가입 목록 재로드 시도
      this.retryJoinListLoad();
    }
  }

  private async retryUserDataLoad(): Promise<void> {
    try {
      this.debugService.printConsole('Retrying user data load...');
      await this.sharedState.refreshUserStatus();
    } catch (error) {
      this.debugService.printConsole('Failed to retry user data load:', error);
    }
  }

  private async retryJoinListLoad(): Promise<void> {
    try {
      this.debugService.printConsole('Retrying join list data load...');
      await this.sharedState.refreshUserJoinList();
    } catch (error) {
      this.debugService.printConsole('Failed to retry join list data load:', error);
    }
  }

  // === 이벤트 핸들러들 (개선됨) ===
  onNavigationChange(tab: string): void {
    this.debugService.printConsole('Navigation change requested:', tab);
    
    if (!this.sharedState.initialized()) {
      this.debugService.printConsole('Cannot navigate - SharedState not initialized');
      return;
    }

    try {
      this.sharedState.setActiveTab(tab);
      this.debugService.printConsole('Navigation successful:', tab);
    } catch (error) {
      this.debugService.printConsole('Navigation failed:', error);
    }
  }

  onGroupSelect(groupId: string): void {
    this.debugService.printConsole('Group selection requested:', groupId);
    
    if (!this.sharedState.initialized()) {
      this.debugService.printConsole('Cannot select group - SharedState not initialized');
      return;
    }

    // 유효한 그룹인지 확인
    const availableGroups = this.sharedState.availableGroups();
    const isValidGroup = availableGroups.some(group => group.groupname === groupId);
    
    if (!isValidGroup) {
      this.debugService.printConsole('Invalid group selected:', groupId, 'Available:', availableGroups);
      return;
    }

    try {
      this.sharedState.setSelectedGroup(groupId);
      this.debugService.printConsole('Group selection successful:', groupId);
    } catch (error) {
      this.debugService.printConsole('Group selection failed:', error);
    }
  }

  onChannelSelect(data: { groupId: string, channelId: string }): void {
    this.debugService.printConsole('Channel selection requested:', data);
    
    if (!this.sharedState.initialized()) {
      this.debugService.printConsole('Cannot select channel - SharedState not initialized');
      return;
    }

    // 유효한 채널인지 확인
    const groupChannels = this.sharedState.getGroupChannels(data.groupId);
    const isValidChannel = groupChannels.includes(data.channelId);
    
    if (!isValidChannel) {
      this.debugService.printConsole('Invalid channel selected:', data, 'Available channels:', groupChannels);
      return;
    }

    try {
      this.sharedState.setSelectedChannel(data.channelId, data.groupId);
      this.debugService.printConsole('Channel selection successful:', data);
    } catch (error) {
      this.debugService.printConsole('Channel selection failed:', error);
    }
  }

  onSearchQuery(query: string): void {
    this.debugService.printConsole('Search query:', query);
    
    if (!query.trim()) {
      return;
    }

    // 검색 로직 구현 (SearchService 사용)
    // 실제 검색 결과에 따라 네비게이션 수행
  }

  onNotificationClick(): void {
    this.debugService.printConsole('Notification clicked');
    // 알림 패널 토글 또는 알림 페이지로 이동
  }

  onHelpClick(): void {
    this.debugService.printConsole('Help clicked');
    // 도움말 모달 표시 또는 도움말 페이지로 이동
  }

  onProfileClick(): void {
    this.debugService.printConsole('Profile clicked');
    // 프로필 모달 표시 또는 프로필 페이지로 이동
  }

  // === 액션 메서드들 ===
  async refreshData(): Promise<void> {
    this.debugService.printConsole('Manual data refresh requested');
    
    try {
      this.sharedState.clearError();
      await Promise.all([
        this.sharedState.refreshUserStatus(),
        this.sharedState.refreshUserJoinList()
      ]);
      this.debugService.printConsole('Data refresh completed');
    } catch (error) {
      this.debugService.printConsole('Data refresh failed:', error);
    }
  }

  clearError(): void {
    this.sharedState.clearError();
  }

  // === 템플릿 헬퍼 메서드들 ===
  getLoadingMessage(): string {
    const loadingState = this.sharedState.loadingState();
    
    if (loadingState.user) return '사용자 정보를 불러오는 중...';
    if (loadingState.userJoinList) return '가입 목록을 불러오는 중...';
    if (loadingState.groups) return '그룹 정보를 불러오는 중...';
    if (loadingState.channels) return '채널 정보를 불러오는 중...';
    
    return '데이터를 불러오는 중...';
  }

  shouldShowContent(): boolean {
    return this.sharedState.initialized() && 
           this.sharedState.hasValidData() && 
           !this.sharedState.error();
  }

  shouldShowError(): boolean {
    return this.sharedState.error() !== null;
  }

  shouldShowLoading(): boolean {
    return this.sharedState.isLoading() || !this.sharedState.initialized();
  }

  // === 디버깅 메서드들 (개발용) ===
  debugState(): void {
    this.debugService.printConsole('=== DEBUG STATE ===');
    this.debugService.printConsole('Initialized:', this.sharedState.initialized());
    this.debugService.printConsole('Has Valid Data:', this.sharedState.hasValidData());
    this.debugService.printConsole('Is Loading:', this.sharedState.isLoading());
    this.debugService.printConsole('Error:', this.sharedState.error());
    this.debugService.printConsole('Active Tab:', this.sharedState.activeTab());
    this.debugService.printConsole('Selected Group:', this.sharedState.selectedGroup());
    this.debugService.printConsole('Selected Channel:', this.sharedState.selectedChannel());
    this.debugService.printConsole('Available Groups:', this.sharedState.availableGroups());
    this.debugService.printConsole('Current User:', this.sharedState.currentUser());
    this.debugService.printConsole('=================');
  }
}