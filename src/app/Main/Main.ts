// Main.ts - 실시간 동기화 연동 개선 (주요 부분만)
import { Component, OnInit, OnDestroy, effect, computed, ViewChild } from "@angular/core";
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
import { ChatbotComponent } from "../Core/Component/Chatbot/Chatbot";
import { DonationPageComponent } from "../Core/Component/Donation/Donation";

interface ChannelSelectEvent {
    groupId: string;
    channelId: string;
    channelName?: string;
    clubId?: number;
}

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
    ActivityDashboardComponent,
    ChatbotComponent,
    DonationPageComponent
  ],
  standalone: true
})
export class MainComponent implements OnInit, OnDestroy {
  @ViewChild('sidebarRef') sidebarComponent?: SideBarComponent;
  @ViewChild('memberDashboardRef') memberDashboardComponent?: MemberOptionsComponent;
  
  private destroy$ = new Subject<void>();
  readonly environment = environment;

  // Computed signals for template usage
  readonly isLoading = computed(() => this.sharedState.isLoading());
  readonly hasError = computed(() => this.sharedState.error() !== null);
  readonly errorMessage = computed(() => this.sharedState.error());
  readonly isInitialized = computed(() => this.sharedState.initialized());
  readonly hasValidData = computed(() => this.sharedState.hasValidData());
  readonly hasJoinedGroups = computed(() => this.sharedState.hasJoinedGroups());

  constructor(public sharedState: SharedStateService) {
    // 기존 effect들 유지
    effect(() => {
      const initialized = this.sharedState.initialized();
      const hasData = this.sharedState.hasValidData();
      const hasGroups = this.sharedState.hasJoinedGroups();
      const error = this.sharedState.error();

      if (initialized && hasData && !hasGroups && !error) {
        this.handleNewUser();
      }
    });

    effect(() => {
      const error = this.sharedState.error();
      if (error) {
        console.error('MainComponent detected error:', error);
        this.handleError(error);
      }
    });

    effect(() => {
      const loading = this.sharedState.isLoading();
    });

    effect(() => {
      const hasGroups = this.sharedState.hasJoinedGroups();
      const availableGroups = this.sharedState.availableGroups();

      if (hasGroups && this.sharedState.activeTab() === 'home') {
        console.log('User now has groups - staying on current tab');
      }
    });

    // === 새로 추가: 실시간 데이터 변화 감지 ===
    effect(() => {
      const userJoin = this.sharedState.userJoin();
      const groupCount = userJoin?.joinList?.length || 0;
      
      // 그룹 수 변화 감지 및 UI 컴포넌트 동기화
      if (userJoin) {
        console.log('📊 Main: UserJoin 데이터 변화 감지, 그룹 수:', groupCount);
        this.handleUserJoinDataChange(userJoin);
      }
    });
  }

  ngOnInit(): void {
    setTimeout(() => {
      this.checkInitializationStatus();
    }, 0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // === 새로 추가: 실시간 동기화 처리 메서드들 ===

  /**
   * UserJoin 데이터 변화를 감지하고 하위 컴포넌트들을 동기화
   */
  private handleUserJoinDataChange(userJoin: any): void {
    // SideBar 컴포넌트 동기화
    if (this.sidebarComponent) {
      console.log('🔄 SideBar 컴포넌트 데이터 동기화');
      this.sidebarComponent.userJoin = userJoin;
    }

    // MemberDashboard 컴포넌트 동기화 (활성화된 경우)
    if (this.memberDashboardComponent && this.sharedState.activeTab() === 'member') {
      console.log('🔄 MemberDashboard 컴포넌트 데이터 동기화');
      // 멤버 대시보드의 그룹 목록 새로고침 트리거
      this.triggerMemberDashboardRefresh();
    }
  }

  /**
   * 멤버 대시보드의 데이터 새로고침을 트리거
   */
  private async triggerMemberDashboardRefresh(): Promise<void> {
    try {
      if (this.memberDashboardComponent) {
        // 멤버 대시보드에서 그룹 목록 다시 로드
        await this.memberDashboardComponent['loadJoinedGroups']();
        console.log('✅ 멤버 대시보드 데이터 새로고침 완료');
      }
    } catch (error) {
      console.error('❌ 멤버 대시보드 새로고침 실패:', error);
    }
  }

  /**
   * 탭 변경 시 필요한 경우 강제 동기화 실행
   */
  onNavigationChange(tab: string): void {
    if (!this.sharedState.initialized()) {
      console.warn('Cannot navigate - SharedState not initialized');
      return;
    }

    try {
      this.sharedState.setActiveTab(tab);
      
      // 특정 탭으로 이동할 때 데이터 일관성 확인
      if (tab === 'group' || tab === 'member') {
        this.ensureDataConsistencyForTab(tab);
      }
      
      if (tab === 'group' && !this.sharedState.hasJoinedGroups()) {
        console.log('User navigated to group tab but has no joined groups');
      }
      
    } catch (error) {
      console.error('Navigation failed:', error);
    }
  }

  /**
   * 특정 탭에 대한 데이터 일관성 보장
   */
  private async ensureDataConsistencyForTab(tab: string): Promise<void> {
    try {
      console.log(`🔍 ${tab} 탭 데이터 일관성 확인 중...`);
      
      const currentUserJoin = this.sharedState.userJoin();
      
      // 데이터가 없거나 오래된 것 같으면 새로고침
      if (!currentUserJoin || currentUserJoin.joinList?.length === 0) {
        console.log('📡 데이터 부족, 새로고침 실행');
        await this.sharedState.refreshUserJoin();
      }
      
      // 선택된 그룹/채널의 유효성 재검증
      this.validateCurrentSelections();
      
    } catch (error) {
      console.error('❌ 탭 데이터 일관성 확인 실패:', error);
    }
  }

  /**
   * 현재 선택된 그룹/채널이 여전히 유효한지 확인
   */
  private validateCurrentSelections(): void {
    const selectedGroup = this.sharedState.selectedGroup();
    const selectedChannel = this.sharedState.selectedChannel();
    const availableGroups = this.sharedState.availableGroups();
    
    // 선택된 그룹이 더 이상 존재하지 않는 경우
    if (selectedGroup && !availableGroups.some(g => g.groupname === selectedGroup)) {
      console.log('⚠️ Main: 선택된 그룹이 더 이상 존재하지 않음, 선택 해제');
      this.sharedState.setSelectedGroup(null);
      this.sharedState.setSelectedChannel(null);
    }
    
    // 선택된 채널이 더 이상 존재하지 않는 경우
    if (selectedChannel && selectedGroup) {
      const group = availableGroups.find(g => g.groupname === selectedGroup);
      const hasChannel = group?.clubList?.some((club: any) => {
        const clubName = typeof club === 'string' ? club : club.name;
        return clubName === selectedChannel;
      });
      
      if (!hasChannel) {
        console.log('⚠️ Main: 선택된 채널이 더 이상 존재하지 않음, 선택 해제');
        this.sharedState.setSelectedChannel(null);
      }
    }
  }

  // === 기존 메서드들 유지 ===
  
  onGroupSelect(groupId: string): void {
    if (!this.sharedState.initialized()) {
      console.warn('Cannot select group - SharedState not initialized');
      return;
    }

    const availableGroups = this.sharedState.availableGroups();
    const isValidGroup = availableGroups.some(group => group.groupname === groupId);
    
    if (!isValidGroup) {
      console.warn('Invalid group selected:', groupId, 'Available:', availableGroups);
      return;
    }

    try {
      this.sharedState.setSelectedGroup(groupId);
    } catch (error) {
      console.error('Group selection failed:', error);
    }
  }

  onChannelSelect(data: ChannelSelectEvent): void {
    if (!this.sharedState.initialized()) {
        console.warn('❌ SharedState가 초기화되지 않음 - 채널 선택 불가');
        return;
    }

    if (!data.groupId || !data.channelId) {
        console.error('❌ 필수 데이터 누락:', { groupId: data.groupId, channelId: data.channelId });
        return;
    }

    const availableGroups = this.sharedState.availableGroups();
    const isValidGroup = availableGroups.some(group => group.groupname === data.groupId);
    
    if (!isValidGroup) {
        console.warn('❌ 유효하지 않은 그룹:', data.groupId);
        return;
    }

    const groupChannels = this.sharedState.getGroupChannels(data.groupId);
    const isValidChannel = groupChannels.includes(data.channelId);
    
    if (!isValidChannel) {
        console.warn('❌ 유효하지 않은 채널:', data.channelId);
        return;
    }

    try {
        if (data.clubId && data.clubId !== -1) {
            this.sharedState.setSelectedChannelByClubId(
                data.clubId, 
                data.channelName || data.channelId, 
                data.groupId
            );
        } else {
            this.sharedState.setSelectedChannel(
                data.channelId, 
                data.groupId, 
                data.channelName
            );
        }

        const currentChannel = this.sharedState.currentChannelWithId();

        if (currentChannel.id === -1) {
            console.error('❌ 채널 설정 실패 - clubId가 -1');
        } else {
            console.log('✅ 채널 선택 성공:', {
                groupName: data.groupId,
                channelName: data.channelId,
                clubId: currentChannel.id
            });
        }

    } catch (error) {
        console.error('❌ 채널 선택 처리 중 오류:', error);
    }
  }

  // === 기타 이벤트 핸들러들 ===
  
  onSearchQuery(query: string): void {
    if (!query.trim()) {
      return;
    }
    // 검색 로직 구현
  }

  onNotificationClick(): void {
    console.log('Notification clicked');
  }

  onHelpClick(): void {
    console.log('Help clicked');
  }

  onProfileClick(): void {
    console.log('Profile clicked');
  }

  // === 액션 메서드들 ===
  
  async refreshData(): Promise<void> {
    try {
      this.sharedState.clearError();
      
      console.log('🔄 Main: 전체 데이터 새로고침 시작');
      
      // 강제 새로고침으로 최신 데이터 보장
      await Promise.all([
        this.sharedState.refreshUserStatus(),
        this.sharedState.forceRefreshUserJoin()  // 개선된 메서드 사용
      ]);
      
      // 하위 컴포넌트들도 새로고침
      await this.refreshChildComponents();
      
      console.log('✅ Main: 전체 데이터 새로고침 완료');
      
    } catch (error) {
      console.error('❌ Main: 데이터 새로고침 실패:', error);
    }
  }

  /**
   * 하위 컴포넌트들의 데이터 새로고침
   */
  private async refreshChildComponents(): Promise<void> {
    try {
      // SideBar 컴포넌트 새로고침
      if (this.sidebarComponent) {
        await this.sidebarComponent.forceRefreshSidebarData();
      }
      
      // MemberDashboard 컴포넌트 새로고침 (활성화된 경우)
      if (this.memberDashboardComponent && this.sharedState.activeTab() === 'member') {
        await this.triggerMemberDashboardRefresh();
      }
      
      console.log('✅ 하위 컴포넌트 새로고침 완료');
      
    } catch (error) {
      console.error('❌ 하위 컴포넌트 새로고침 실패:', error);
    }
  }

  clearError(): void {
    this.sharedState.clearError();
  }

  navigateToGroupJoin(): void {
    console.log('Navigating to group join page');
  }

  // === 템플릿 헬퍼 메서드들 ===
  
  getLoadingMessage(): string {
    const loadingState = this.sharedState.loadingState();
    
    if (loadingState.user) return '사용자 정보를 불러오는 중...';
    if (loadingState.userJoin) return '가입 목록을 불러오는 중...';
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
    if (error && error.includes('가입 목록')) {
      return false;
    }
    return error !== null;
  }

  shouldShowLoading(): boolean {
    return this.sharedState.isLoading() || !this.sharedState.initialized();
  }

  shouldShowNewUserGuide(): boolean {
    return this.shouldShowContent() && 
           !this.sharedState.hasJoinedGroups() && 
           this.sharedState.activeTab() === 'group';
  }

  getGroupSelectionMessage(): string {
    if (!this.sharedState.hasJoinedGroups()) {
      return '아직 참여한 그룹이 없습니다. 새로운 그룹에 참여해보세요!';
    }
    return '왼쪽 사이드바에서 참여하고 싶은 그룹을 선택해 보세요.';
  }

  // === 기존 초기화 및 에러 처리 메서드들 ===
  
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
  }

  private handleNewUser(): void {
    console.log('Handling new user (no joined groups)');
  }

  private suggestGroupJoin(): void {
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

  private handleError(error: string): void {
    console.error('Handling error in MainComponent:', error);
    
    if (error.includes('사용자 정보')) {
      this.handleUserError();
    } else if (error.includes('가입 목록')) {
      this.handleJoinListError();
    }
  }

  private handleUserError(): void {
    console.log('Handling user error - may redirect to profile setup');
  }

  private handleJoinListError(): void {
    console.log('Handling join list error - treating as new user');
    this.sharedState.clearError();
  }

  private handleMissingData(): void {
    if (!this.sharedState.currentUser()) {
      console.log('Missing user data');
      this.retryUserDataLoad();
    }

    if (!this.sharedState.userJoin()) {
      console.log('Missing join list data');
      this.retryJoinListLoad();
    }
  }

  private async retryUserDataLoad(): Promise<void> {
    try {
      await this.sharedState.refreshUserStatus();
    } catch (error) {
      console.error('Failed to retry user data load:', error);
    }
  }

  private async retryJoinListLoad(): Promise<void> {
    try {
      await this.sharedState.refreshUserJoin();
    } catch (error) {
      console.error('Failed to retry join list data load:', error);
    }
  }

  // === 디버깅 메서드들 ===
  
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
    console.log('User Join List:', this.sharedState.userJoin());
    console.log('=================');
  }

  /**
   * 전체 앱 상태 강제 재설정 (긴급 상황용)
   */
  async emergencyStateReset(): Promise<void> {
    console.log('🚨 Main: 긴급 상태 재설정 실행');
    
    try {
      // SharedStateService 긴급 리셋
      await this.sharedState.safeForcedReinitialization();
      
      // 하위 컴포넌트들도 새로고침
      await this.refreshChildComponents();
      
      console.log('✅ 긴급 상태 재설정 완료');
      
    } catch (error) {
      console.error('❌ 긴급 상태 재설정 실패:', error);
      
      // 최후의 수단: 페이지 새로고침
      if (confirm('앱 상태 복구에 실패했습니다. 페이지를 새로고침하시겠습니까?')) {
        window.location.reload();
      }
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