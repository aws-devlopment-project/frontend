// Main.ts - 개선된 버전 (초기 사용자 지원)
import { Component, OnInit, OnDestroy, effect, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { MatIconModule } from "@angular/material/icon";

import { SideBarComponent } from "../Core/Component/SideBar/SideBar";
import { HeaderBarComponent } from "../Core/Component/HeaderBar/HeaderBar";
import { GroupDashboardComponent } from "../DashBoard/Component/GroupDashboard/GroupDashboard";
import { HomeDashboardComponent } from "../DashBoard/Component/HomeDashboard/HomeDashboard";
import { MainContainerComponent } from "../Channel/Component/MainContainer/MainContainer";
import { MemberOptionsComponent } from "../DashBoard/Component/MemberDashboard/MemberDashboard";
import { ActivityDashboardComponent } from "../DashBoard/Component/ActivityDashboard/ActivityDashboard";
import { SharedStateService } from "../Core/Service/SharedService";
import { environment } from "../../environments/environtment";
import { RouterModule } from "@angular/router";

@Component({
  selector: 'app-main',
  templateUrl: './Main.html',
  styleUrl: './Main.css',
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
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
  readonly hasJoinedGroups = computed(() => this.sharedState.hasJoinedGroups());

  constructor(public sharedState: SharedStateService) {
    console.log('MainComponent initialized with SharedStateService');
    
    // 초기화 상태 모니터링
    effect(() => {
      const initialized = this.sharedState.initialized();
      const hasData = this.sharedState.hasValidData();
      const hasGroups = this.sharedState.hasJoinedGroups();
      const error = this.sharedState.error();
      
      console.log('MainComponent state:', {
        initialized,
        hasData,
        hasGroups,
        error,
        activeTab: this.sharedState.activeTab(),
        selectedGroup: this.sharedState.selectedGroup(),
        selectedChannel: this.sharedState.selectedChannel()
      });

      // 초기화 완료 후 첫 방문자 처리
      if (initialized && hasData && !hasGroups && !error) {
        this.handleNewUser();
      }
    });

    // 에러 상태 모니터링
    effect(() => {
      const error = this.sharedState.error();
      if (error) {
        console.error('MainComponent detected error:', error);
        this.handleError(error);
      }
    });

    // 로딩 상태 모니터링
    effect(() => {
      const loading = this.sharedState.isLoading();
      console.log('MainComponent loading state:', loading);
    });

    // 그룹 참여 상태 변화 모니터링
    effect(() => {
      const hasGroups = this.sharedState.hasJoinedGroups();
      const availableGroups = this.sharedState.availableGroups();
      
      console.log('Group participation changed:', {
        hasGroups,
        groupCount: availableGroups.length,
        groups: availableGroups.map(g => g.groupname)
      });

      // 새로 그룹에 참여했을 때 처리
      if (hasGroups && this.sharedState.activeTab() === 'home') {
        console.log('User now has groups - staying on current tab');
      }
    });
  }

  ngOnInit(): void {
    console.log('MainComponent ngOnInit');
    
    // 컴포넌트가 완전히 초기화된 후 추가 설정
    setTimeout(() => {
      this.checkInitializationStatus();
    }, 0);
  }

  ngOnDestroy(): void {
    console.log('MainComponent ngOnDestroy');
    this.destroy$.next();
    this.destroy$.complete();
  }

  // === 초기화 상태 확인 ===
  private checkInitializationStatus(): void {
    if (!this.sharedState.initialized()) {
      console.log('SharedState not initialized, waiting...');
      return;
    }

    if (!this.sharedState.hasValidData()) {
      console.warn('SharedState initialized but missing valid data');
      this.handleMissingData();
      return;
    }

    console.log('MainComponent fully initialized with valid data');
  }

  // === 새 사용자 처리 ===
  private handleNewUser(): void {
    console.log('Handling new user (no joined groups)');
    
    // 새 사용자에게 환영 메시지나 온보딩 가이드를 보여줄 수 있음
    // 현재는 홈 탭에서 그룹 가입을 권유하는 UI를 표시
    
    // 필요시 자동으로 그룹 가입 페이지로 안내할 수도 있음
    // this.suggestGroupJoin();
  }

  private suggestGroupJoin(): void {
    // 사용자에게 그룹 가입을 제안하는 알림 표시
    console.log('Suggesting group join to new user');
    
    // 예시: 3초 후 그룹 가입 페이지로 이동 제안
    setTimeout(() => {
      if (!this.sharedState.hasJoinedGroups()) {
        const shouldJoin = confirm(
          '아직 참여한 그룹이 없습니다.\n그룹에 참여해서 다른 사람들과 함께 목표를 달성해보시겠어요?'
        );
        
        if (shouldJoin) {
          this.navigateToGroupJoin();
        }
      }
    }, 3000);
  }

  // === 에러 처리 ===
  private handleError(error: string): void {
    console.error('Handling error in MainComponent:', error);
    
    // 필요에 따라 특정 에러에 대한 처리
    if (error.includes('사용자 정보')) {
      this.handleUserError();
    } else if (error.includes('가입 목록')) {
      this.handleJoinListError();
    }
  }

  private handleUserError(): void {
    console.log('Handling user error - may redirect to profile setup');
    // 사용자 프로필 설정 페이지로 이동하거나 재시도 옵션 제공
  }

  private handleJoinListError(): void {
    console.log('Handling join list error - treating as new user');
    // 가입 목록 로드 실패는 새 사용자로 처리
    // 에러를 무시하고 빈 목록으로 계속 진행
    this.sharedState.clearError();
  }

  // === 데이터 부족 처리 ===
  private handleMissingData(): void {
    console.log('Handling missing data situation');
    
    if (!this.sharedState.currentUser()) {
      console.log('Missing user data');
      this.retryUserDataLoad();
    }

    if (!this.sharedState.userJoinList()) {
      console.log('Missing join list data');
      this.retryJoinListLoad();
    }
  }

  private async retryUserDataLoad(): Promise<void> {
    try {
      console.log('Retrying user data load...');
      await this.sharedState.refreshUserStatus();
    } catch (error) {
      console.error('Failed to retry user data load:', error);
    }
  }

  private async retryJoinListLoad(): Promise<void> {
    try {
      console.log('Retrying join list data load...');
      await this.sharedState.refreshUserJoinList();
    } catch (error) {
      console.error('Failed to retry join list data load:', error);
      // 가입 목록 로드 실패는 새 사용자로 처리
      console.log('Treating join list load failure as new user scenario');
    }
  }

  // === 이벤트 핸들러들 (개선됨) ===
  onNavigationChange(tab: string): void {
    console.log('Navigation change requested:', tab);
    
    if (!this.sharedState.initialized()) {
      console.warn('Cannot navigate - SharedState not initialized');
      return;
    }

    try {
      this.sharedState.setActiveTab(tab);
      console.log('Navigation successful:', tab);
      
      // 그룹 탭으로 이동했는데 참여한 그룹이 없는 경우 안내
      if (tab === 'group' && !this.sharedState.hasJoinedGroups()) {
        console.log('User navigated to group tab but has no joined groups');
      }
      
    } catch (error) {
      console.error('Navigation failed:', error);
    }
  }

  onGroupSelect(groupId: string): void {
    console.log('Group selection requested:', groupId);
    
    if (!this.sharedState.initialized()) {
      console.warn('Cannot select group - SharedState not initialized');
      return;
    }

    // 유효한 그룹인지 확인
    const availableGroups = this.sharedState.availableGroups();
    const isValidGroup = availableGroups.some(group => group.groupname === groupId);
    
    if (!isValidGroup) {
      console.warn('Invalid group selected:', groupId, 'Available:', availableGroups);
      return;
    }

    try {
      this.sharedState.setSelectedGroup(groupId);
      console.log('Group selection successful:', groupId);
    } catch (error) {
      console.error('Group selection failed:', error);
    }
  }

  onChannelSelect(data: { groupId: string, channelId: string }): void {
    console.log('Channel selection requested:', data);
    
    if (!this.sharedState.initialized()) {
      console.warn('Cannot select channel - SharedState not initialized');
      return;
    }

    // 유효한 채널인지 확인
    const groupChannels = this.sharedState.getGroupChannels(data.groupId);
    const isValidChannel = groupChannels.includes(data.channelId);
    
    if (!isValidChannel) {
      console.warn('Invalid channel selected:', data, 'Available channels:', groupChannels);
      return;
    }

    try {
      this.sharedState.setSelectedChannel(data.channelId, data.groupId);
      console.log('Channel selection successful:', data);
    } catch (error) {
      console.error('Channel selection failed:', error);
    }
  }

  onSearchQuery(query: string): void {
    console.log('Search query:', query);
    
    if (!query.trim()) {
      return;
    }

    // 검색 로직 구현 (SearchService 사용)
    // 실제 검색 결과에 따라 네비게이션 수행
  }

  onNotificationClick(): void {
    console.log('Notification clicked');
    // 알림 패널 토글 또는 알림 페이지로 이동
  }

  onHelpClick(): void {
    console.log('Help clicked');
    // 도움말 모달 표시 또는 도움말 페이지로 이동
  }

  onProfileClick(): void {
    console.log('Profile clicked');
    // 프로필 모달 표시 또는 프로필 페이지로 이동
  }

  // === 액션 메서드들 ===
  async refreshData(): Promise<void> {
    console.log('Manual data refresh requested');
    
    try {
      this.sharedState.clearError();
      await Promise.all([
        this.sharedState.refreshUserStatus(),
        this.sharedState.refreshUserJoinList()
      ]);
      console.log('Data refresh completed');
    } catch (error) {
      console.error('Data refresh failed:', error);
    }
  }

  clearError(): void {
    this.sharedState.clearError();
  }

  navigateToGroupJoin(): void {
    console.log('Navigating to group join page');
    // RouterModule을 통해 그룹 가입 페이지로 이동
    // 실제 라우팅 경로는 앱의 라우팅 설정에 따라 다름
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
    const error = this.sharedState.error();
    // 가입 목록 관련 에러는 새 사용자로 처리하므로 에러로 표시하지 않음
    if (error && error.includes('가입 목록')) {
      return false;
    }
    return error !== null;
  }

  shouldShowLoading(): boolean {
    return this.sharedState.isLoading() || !this.sharedState.initialized();
  }

  // 새로 추가: 새 사용자 안내 메시지 표시 여부
  shouldShowNewUserGuide(): boolean {
    return this.shouldShowContent() && 
           !this.sharedState.hasJoinedGroups() && 
           this.sharedState.activeTab() === 'group';
  }

  // 새로 추가: 그룹 선택 안내 메시지 커스터마이징
  getGroupSelectionMessage(): string {
    if (!this.sharedState.hasJoinedGroups()) {
      return '아직 참여한 그룹이 없습니다. 새로운 그룹에 참여해보세요!';
    }
    return '왼쪽 사이드바에서 참여하고 싶은 그룹을 선택해 보세요.';
  }

  // === 디버깅 메서드들 (개발용) ===
  debugState(): void {
    console.log('=== DEBUG STATE ===');
    console.log('Initialized:', this.sharedState.initialized());
    console.log('Has Valid Data:', this.sharedState.hasValidData());
    console.log('Has Joined Groups:', this.sharedState.hasJoinedGroups());
    console.log('Is Loading:', this.sharedState.isLoading());
    console.log('Error:', this.sharedState.error());
    console.log('Active Tab:', this.sharedState.activeTab());
    console.log('Selected Group:', this.sharedState.selectedGroup());
    console.log('Selected Channel:', this.sharedState.selectedChannel());
    console.log('Available Groups:', this.sharedState.availableGroups());
    console.log('Current User:', this.sharedState.currentUser());
    console.log('User Join List:', this.sharedState.userJoinList());
    console.log('=================');
  }

  // 테스트용 메서드들 (개발 환경에서만 사용)
  
  simulateGroupJoin(): void {
    if (!environment.production) {
      console.log('Simulating group join for testing');
      this.sharedState.addUserGroupWithChannels('테스트 그룹', ['테스트 채널1', '테스트 채널2']);
    }
  }

  simulateGroupLeave(): void {
    if (!environment.production && this.sharedState.hasJoinedGroups()) {
      const firstGroup = this.sharedState.availableGroups()[0];
      console.log('Simulating group leave for testing:', firstGroup.groupname);
      this.sharedState.removeUserGroup(firstGroup.groupname);
    }
  }
}