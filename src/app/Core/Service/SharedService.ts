// SharedService.ts - 개선된 버전 (동적 그룹/채널 추가 지원)
import { Injectable, signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { UserStatus, UserJoinList } from '../Models/user';
import { ChatMessage } from '../../Channel/Models/chatMessage';
import { UserService } from './UserService';

// 타입 정의
type JoinListItem = {
  groupname: string;
  clubList: string[];
};

export interface LoadingState {
  user: boolean;
  userJoinList: boolean;
  groups: boolean;
  channels: boolean;
}

export interface NavigationState {
  shouldRedirectToJoin: boolean;
  redirectReason: 'no_groups' | 'no_channels' | null;
  lastAttemptedTab: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class SharedStateService {
  // === 기본 Signals ===
  private _activeTab = signal<string>('home');
  private _selectedGroup = signal<string | null>(null);
  private _selectedChannel = signal<string | null>(null);
  private _currentUser = signal<UserStatus | null>(null);
  private _loadingState = signal<LoadingState>({
    user: false,
    userJoinList: false,
    groups: false,
    channels: false
  });
  private _messages = signal<ChatMessage[]>([]);
  private _sidebarExpanded = signal(false);
  private _expandedSections = signal<string[]>([]);
  private _userJoinList = signal<UserJoinList | null>(null);
  private _initialized = signal(false);
  private _error = signal<string | null>(null);
  
  // === 새로운 Navigation State ===
  private _navigationState = signal<NavigationState>({
    shouldRedirectToJoin: false,
    redirectReason: null,
    lastAttemptedTab: null
  });

  // === 읽기 전용 Signals ===
  readonly activeTab = this._activeTab.asReadonly();
  readonly selectedGroup = this._selectedGroup.asReadonly();
  readonly selectedChannel = this._selectedChannel.asReadonly();
  readonly currentUser = this._currentUser.asReadonly();
  readonly loadingState = this._loadingState.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly sidebarExpanded = this._sidebarExpanded.asReadonly();
  readonly expandedSections = this._expandedSections.asReadonly();
  readonly userJoinList = this._userJoinList.asReadonly();
  readonly initialized = this._initialized.asReadonly();
  readonly error = this._error.asReadonly();
  readonly navigationState = this._navigationState.asReadonly();

  // === Computed Signals ===
  readonly isLoading = computed(() => {
    const state = this.loadingState();
    return state.user || state.userJoinList || state.groups || state.channels;
  });

  readonly isChannelSelected = computed(() => 
    this.selectedChannel() !== null
  );

  readonly isGroupSelected = computed(() => 
    this.selectedGroup() !== null
  );

  readonly availableGroups = computed(() => {
    return this.userJoinList()?.joinList || [];
  });

  readonly hasGroups = computed(() => {
    return this.availableGroups().length > 0;
  });

  readonly hasChannels = computed(() => {
    const groups = this.availableGroups();
    return groups.some(group => group.clubList.length > 0);
  });

  readonly canUseGroupFeatures = computed(() => {
    return this.hasGroups() && this.hasChannels();
  });

  readonly currentPageTitle = computed(() => {
    const tab = this.activeTab();
    const group = this.selectedGroup();
    const channel = this.selectedChannel();
    
    if (channel && group) {
      return this.getChannelTitle(group, channel);
    } else if (group) {
      return this.getGroupTitle(group);
    } else {
      return this.getTabTitle(tab);
    }
  });

  readonly shouldShowSidebar = computed(() => 
    true // 메뉴바는 항상 표시
  );

  readonly shouldShowGroupBar = computed(() => 
    this.activeTab() === 'group' && this.sidebarExpanded()
  );

  readonly channelInfo = computed(() => {
    const group = this.selectedGroup();
    const channel = this.selectedChannel();
    
    if (!group || !channel) return null;
    
    return {
      groupName: group,
      channelName: channel,
      name: this.getChannelName(channel),
      description: this.getChannelDescription(group, channel)
    };
  });

  readonly hasValidData = computed(() => {
    return this.initialized() && this.currentUser() !== null && this.userJoinList() !== null;
  });

  // 새로 추가: 빈 목록인지 확인
  readonly hasJoinedGroups = computed(() => {
    const joinList = this.userJoinList();
    return joinList ? joinList.joinList.length > 0 : false;
  });

  // === Constructor ===
  constructor(private userService: UserService) {
    effect(() => {
      if (!this.initialized()) {
        this.initializeUserData();
      }
    });

    effect(() => {
      const error = this.error();
      if (error) {
        console.error('SharedStateService Error:', error);
      }
    });

    // 가입 상태 모니터링 및 자동 리다이렉트
    effect(() => {
      if (this.initialized() && this.hasValidData()) {
        this.checkJoinStatusAndRedirect();
      }
    });
  }

  private async initializeUserData(): Promise<void> {
    if (this.initialized()) return;

    try {
      this.setError(null);
      this.setLoadingState('user', true);
      this.setLoadingState('userJoinList', true);

      // 병렬로 데이터 로드
      const [user, joinList] = await Promise.allSettled([
        this.loadUserStatus(),
        this.loadUserJoinList()
      ]);

      // 사용자 상태 처리
      if (user.status === 'fulfilled' && user.value) {
        this.setCurrentUser(user.value);
      } else if (user.status === 'rejected') {
        console.error('Failed to load user status:', user.reason);
        this.setError('사용자 정보를 불러올 수 없습니다.');
      }

      // 가입 목록 처리 - 빈 목록도 허용
      if (joinList.status === 'fulfilled') {
        const joinListData = joinList.value || { id: '', name: '', joinList: [] };
        this._userJoinList.set(joinListData);
        
        // 가입한 그룹이 있는 경우에만 기본 선택 설정
        if (joinListData.joinList.length > 0) {
          this.initializeDefaultSelections(joinListData);
        } else {
          console.log('User has no joined groups - skipping default selections');
        }
      } else if (joinList.status === 'rejected') {
        console.error('Failed to load user join list:', joinList.reason);
        // 빈 목록으로 초기화 (에러로 처리하지 않음)
        this._userJoinList.set({ id: '', joinList: [] });
        console.log('Initialized with empty join list due to error');
      }

      this._initialized.set(true);
      console.log('SharedStateService initialized successfully', {
        hasUser: !!this.currentUser(),
        hasJoinedGroups: this.hasJoinedGroups()
      });

    } catch (error) {
      console.error('Error initializing SharedStateService:', error);
      this.setError('초기화 중 오류가 발생했습니다.');
    } finally {
      this.setLoadingState('user', false);
      this.setLoadingState('userJoinList', false);
    }
  }

  // === 새로운 가입 상태 확인 및 리다이렉트 로직 ===
  private checkJoinStatusAndRedirect(): void {
    const hasGroups = this.hasGroups();
    const hasChannels = this.hasChannels();
    const currentTab = this.activeTab();

    console.log('Checking join status:', {
      hasGroups,
      hasChannels,
      currentTab,
      availableGroups: this.availableGroups()
    });

    // 그룹이 없는 경우
    if (!hasGroups) {
      console.log('No groups found, redirecting to member dashboard');
      this.handleNoGroups();
      return;
    }

    // 그룹은 있지만 채널이 없는 경우
    if (!hasChannels) {
      console.log('Groups found but no channels, redirecting to member dashboard');
      this.handleNoChannels();
      return;
    }

    // 그룹과 채널이 모두 있는 경우 - 기본 선택 설정
    if (currentTab === 'group' && (!this.selectedGroup() || !this.selectedChannel())) {
      this.initializeDefaultSelections();
    }

    // 리다이렉트 플래그 해제
    this._navigationState.update(state => ({
      ...state,
      shouldRedirectToJoin: false,
      redirectReason: null
    }));
  }

  private handleNoGroups(): void {
    this._navigationState.update(state => ({
      shouldRedirectToJoin: true,
      redirectReason: 'no_groups',
      lastAttemptedTab: this.activeTab()
    }));

    // group/join 페이지로 리다이렉트
    this.router.navigate(['/group/join']);
    
    console.log('User needs to join groups first - redirecting to /group/join');
  }

  private handleNoChannels(): void {
    this._navigationState.update(state => ({
      shouldRedirectToJoin: true,
      redirectReason: 'no_channels',
      lastAttemptedTab: this.activeTab()
    }));

    // group/join 페이지로 리다이렉트
    this.router.navigate(['/group/join']);
    
    console.log('User needs to join channels first - redirecting to /group/join');
  }

  private initializeDefaultSelections(): void {
    const groups = this.availableGroups();
    if (groups.length === 0) return;

    const firstGroup = groups[0];
    
    // 첫 번째 그룹을 확장 상태로 설정
    this._expandedSections.set([firstGroup.groupname]);
    
    // 첫 번째 그룹 선택
    this.setSelectedGroup(firstGroup.groupname);
    
    // 첫 번째 채널 선택 (있는 경우)
    if (firstGroup.clubList.length > 0) {
      this.setSelectedChannel(firstGroup.clubList[0], firstGroup.groupname);
    }

    console.log('Default selections initialized:', {
      group: firstGroup.groupname,
      channel: firstGroup.clubList[0] || null
    });
  }

  // === 가입 완료 후 호출할 메서드 ===
  async onUserJoinedGroup(groupName: string): Promise<void> {
    console.log('User joined group:', groupName);
    
    try {
      // 사용자 가입 목록 새로고침
      await this.refreshUserJoinList();
      
      // 가입한 그룹을 자동 선택
      this.setSelectedGroup(groupName);
      
      // 그룹 탭으로 이동
      this.setActiveTab('group');
      
      console.log('Successfully switched to new group:', groupName);
    } catch (error) {
      console.error('Error handling group join:', error);
    }
  }

  async onUserJoinedChannel(groupName: string, channelName: string): Promise<void> {
    console.log('User joined channel:', { groupName, channelName });
    
    try {
      // 사용자 가입 목록 새로고침
      await this.refreshUserJoinList();
      
      // 해당 그룹과 채널 선택
      this.setSelectedGroup(groupName);
      this.setSelectedChannel(channelName, groupName);
      
      // 그룹 탭으로 이동
      this.setActiveTab('group');
      
      console.log('Successfully switched to new channel:', { groupName, channelName });
    } catch (error) {
      console.error('Error handling channel join:', error);
    }
  }

  // === 개선된 탭 액션 ===
  setActiveTab(tab: string): void {
    const previousTab = this._activeTab();
    
    // 그룹 탭으로 이동 시 가입 상태 확인
    if (tab === 'group') {
      if (!this.canUseGroupFeatures()) {
        console.log('Cannot access group features, user needs to join groups/channels');
        
        // 가입이 필요함을 알리고 group/join 페이지로 리다이렉트
        this._navigationState.update(state => ({
          shouldRedirectToJoin: true,
          redirectReason: !this.hasGroups() ? 'no_groups' : 'no_channels',
          lastAttemptedTab: tab
        }));
        
        this.router.navigate(['/group/join']);
        return;
      }
      
      // 그룹 기능 사용 가능 - 정상 진행
      this._sidebarExpanded.set(true);
      
      // 기본 선택이 없으면 설정
      if (!this._selectedGroup() || !this._selectedChannel()) {
        this.initializeDefaultSelections();
      }
    } else {
      // 다른 탭일 때는 그룹바 숨김
      this._sidebarExpanded.set(false);
    }
    
    this._activeTab.set(tab);
    
    console.log(`Tab changed: ${previousTab} → ${tab}`, {
      selectedGroup: this._selectedGroup(),
      selectedChannel: this._selectedChannel(),
      sidebarExpanded: this._sidebarExpanded(),
      navigationState: this._navigationState()
    });
  }

  // === 가입 관련 헬퍼 메서드들 ===
  getJoinStatusMessage(): string {
    const navState = this._navigationState();
    
    if (!navState.shouldRedirectToJoin) return '';
    
    switch (navState.redirectReason) {
      case 'no_groups':
        return '그룹 채팅을 이용하려면 먼저 그룹에 가입해주세요.';
      case 'no_channels':
        return '그룹에는 가입했지만, 채널에 가입해주세요.';
      default:
        return '그룹 또는 채널에 가입이 필요합니다.';
    }
  }

  canReturnToPreviousTab(): boolean {
    const navState = this._navigationState();
    return navState.lastAttemptedTab !== null && this.canUseGroupFeatures();
  }

  returnToPreviousTab(): void {
    const navState = this._navigationState();
    
    if (navState.lastAttemptedTab && this.canUseGroupFeatures()) {
      this.setActiveTab(navState.lastAttemptedTab);
      
      // 네비게이션 상태 리셋
      this._navigationState.update(state => ({
        shouldRedirectToJoin: false,
        redirectReason: null,
        lastAttemptedTab: null
      }));
    }
  }

  // === 새로 추가: 그룹/채널 동적 추가 메서드들 ===
  
  /**
   * 새로운 그룹을 사용자 가입 목록에 추가
   */
  addUserGroup(groupName: string): void {
    const currentJoinList = this._userJoinList();
    
    if (!currentJoinList) {
      console.error('Cannot add group - no join list initialized');
      return;
    }

    // Set을 사용하여 중복 체크
    const existingGroupNames = new Set(currentJoinList.joinList.map(item => item.groupname));
    if (existingGroupNames.has(groupName)) {
      console.log('Group already exists in join list:', groupName);
      return;
    }

    // 새 그룹 추가
    const newGroupItem: JoinListItem = {
      groupname: groupName,
      clubList: []
    };

    const updatedJoinList: UserJoinList = {
      ...currentJoinList,
      joinList: [...currentJoinList.joinList, newGroupItem]
    };

    this._userJoinList.set(updatedJoinList);
    
    // 확장된 섹션에 추가 (중복 방지)
    this._expandedSections.update(sections => {
      const sectionSet = new Set([...sections, groupName]);
      return Array.from(sectionSet);
    });
    
    console.log('Group added to join list:', groupName);

    // 첫 번째 그룹이라면 자동 선택 (그룹 탭에서)
    if (currentJoinList.joinList.length === 0 && this.activeTab() === 'group') {
      this.setSelectedGroup(groupName);
    }
  }

  /**
   * 그룹에 새로운 채널들을 추가
   */
  addUserChannels(groupName: string, channelNames: string[]): void {
    const currentJoinList = this._userJoinList();
    
    if (!currentJoinList) {
      console.error('Cannot add channels - no join list initialized');
      return;
    }

    const groupIndex = currentJoinList.joinList.findIndex(item => item.groupname === groupName);
    if (groupIndex === -1) {
      console.error('Cannot add channels - group not found:', groupName);
      return;
    }

    const updatedJoinList = { ...currentJoinList };
    const targetGroup = { ...updatedJoinList.joinList[groupIndex] };
    
    // Set을 사용하여 중복 제거
    const existingChannelSet = new Set(targetGroup.clubList);
    const newChannelSet = new Set([...existingChannelSet, ...channelNames]);
    const newChannels = Array.from(newChannelSet).filter(channel => !existingChannelSet.has(channel));
    
    if (newChannels.length === 0) {
      console.log('No new channels to add for group:', groupName);
      return;
    }

    // Set으로 중복 제거된 전체 채널 목록 생성
    targetGroup.clubList = Array.from(newChannelSet);
    updatedJoinList.joinList[groupIndex] = targetGroup;
    
    this._userJoinList.set(updatedJoinList);
    
    console.log('Channels added to group:', { groupName, newChannels, totalChannels: targetGroup.clubList.length });

    // 첫 번째 채널이라면 자동 선택 (그룹이 현재 선택된 상태에서)
    if (existingChannelSet.size === 0 && 
        this.selectedGroup() === groupName && 
        !this.selectedChannel() &&
        newChannels.length > 0) {
      this.setSelectedChannel(newChannels[0], groupName);
    }
  }

  /**
   * 그룹과 채널을 한번에 추가 (GroupJoin에서 사용)
   */
  addUserGroupWithChannels(groupName: string, channelNames: string[]): void {
    console.log('Adding group with channels:', { groupName, channelNames });
    
    const currentJoinList = this._userJoinList();
    
    if (!currentJoinList) {
      console.error('Cannot add group with channels - no join list initialized');
      return;
    }

    // Set을 사용하여 중복 체크
    const existingGroupNames = new Set(currentJoinList.joinList.map(item => item.groupname));
    
    if (existingGroupNames.has(groupName)) {
      // 기존 그룹에 채널만 추가 (중복 제거)
      console.log('Group exists, adding channels only:', groupName);
      this.addUserChannels(groupName, channelNames);
    } else {
      // 새 그룹을 채널과 함께 추가 (채널 목록도 중복 제거)
      const uniqueChannels = Array.from(new Set(channelNames));
      
      const newGroupItem: JoinListItem = {
        groupname: groupName,
        clubList: uniqueChannels
      };

      const updatedJoinList: UserJoinList = {
        ...currentJoinList,
        joinList: [...currentJoinList.joinList, newGroupItem]
      };

      this._userJoinList.set(updatedJoinList);
      
      // 확장된 섹션에 추가 (중복 방지)
      this._expandedSections.update(sections => {
        const sectionSet = new Set([...sections, groupName]);
        return Array.from(sectionSet);
      });
      
      console.log('New group with channels added:', { 
        groupName, 
        uniqueChannels, 
        originalChannelCount: channelNames.length,
        finalChannelCount: uniqueChannels.length 
      });

      // 첫 번째 그룹이거나 그룹 탭에서 선택된 그룹이 없다면 자동 선택
      if ((currentJoinList.joinList.length === 0 || !this.selectedGroup()) && 
          this.activeTab() === 'group') {
        this.setSelectedGroup(groupName);
        if (uniqueChannels.length > 0) {
          this.setSelectedChannel(uniqueChannels[0], groupName);
        }
      }
    }
  }

  /**
   * 그룹 제거 (탈퇴 시 사용)
   */
  removeUserGroup(groupName: string): void {
    const currentJoinList = this._userJoinList();
    
    if (!currentJoinList) {
      console.error('Cannot remove group - no join list initialized');
      return;
    }

    const updatedJoinList: UserJoinList = {
      ...currentJoinList,
      joinList: currentJoinList.joinList.filter(item => item.groupname !== groupName)
    };

    this._userJoinList.set(updatedJoinList);
    
    // 확장된 섹션에서 제거
    this._expandedSections.update(sections => sections.filter(section => section !== groupName));
    
    // 현재 선택된 그룹이라면 선택 해제
    if (this.selectedGroup() === groupName) {
      this._selectedGroup.set(null);
      this._selectedChannel.set(null);
      this.clearMessages();
    }
    
    console.log('Group removed from join list:', groupName);
  }

  /**
   * 특정 채널 제거 (채널 탈퇴 시 사용)
   */
  removeUserChannel(groupName: string, channelName: string): void {
    const currentJoinList = this._userJoinList();
    
    if (!currentJoinList) {
      console.error('Cannot remove channel - no join list initialized');
      return;
    }

    const groupIndex = currentJoinList.joinList.findIndex(item => item.groupname === groupName);
    if (groupIndex === -1) {
      console.error('Cannot remove channel - group not found:', groupName);
      return;
    }

    const updatedJoinList = { ...currentJoinList };
    const targetGroup = { ...updatedJoinList.joinList[groupIndex] };
    
    targetGroup.clubList = targetGroup.clubList.filter(channel => channel !== channelName);
    updatedJoinList.joinList[groupIndex] = targetGroup;
    
    this._userJoinList.set(updatedJoinList);
    
    // 현재 선택된 채널이라면 선택 해제
    if (this.selectedChannel() === channelName && this.selectedGroup() === groupName) {
      this._selectedChannel.set(null);
      this.clearMessages();
    }
    
    console.log('Channel removed from group:', { groupName, channelName });
  }

  // === 기존 메서드들 ===
  async refreshUserJoinList(): Promise<void> {
    this.setLoadingState('userJoinList', true);
    try {
      this.userService['cacheService']?.removeCache('userJoinList');
      
      const joinList = await this.loadUserJoinList();
      if (joinList) {
        this._userJoinList.set(joinList);
        console.log('User join list refreshed successfully');
        this.validateCurrentSelections();
      } else {
        // API에서 빈 결과가 왔을 때 빈 목록으로 설정
        this._userJoinList.set({ id: '', joinList: [] });
        console.log('User join list refreshed with empty result');
      }
    } catch (error) {
      console.error('Error refreshing user join list:', error);
      this.setError('가입 목록 새로고침에 실패했습니다.');
    } finally {
      this.setLoadingState('userJoinList', false);
    }
  }

  async refreshUserStatus(): Promise<void> {
    this.setLoadingState('user', true);
    try {
      this.userService['cacheService']?.removeCache('userStatus');
      
      const user = await this.loadUserStatus();
      if (user) {
        this.setCurrentUser(user);
        console.log('User status refreshed successfully');
      }
    } catch (error) {
      console.error('Error refreshing user status:', error);
      this.setError('사용자 상태 새로고침에 실패했습니다.');
    } finally {
      this.setLoadingState('user', false);
    }
  }

  private validateCurrentSelections(): void {
    const joinList = this._userJoinList();
    if (!joinList) return;

    const selectedGroup = this._selectedGroup();
    const selectedChannel = this._selectedChannel();

    if (selectedGroup) {
      const group = joinList.joinList.find(g => g.groupname === selectedGroup);
      if (!group) {
        console.log('Selected group no longer exists, clearing selection');
        this._selectedGroup.set(null);
        this._selectedChannel.set(null);
        return;
      }

      if (selectedChannel && !group.clubList.includes(selectedChannel)) {
        console.log('Selected channel no longer exists, clearing channel selection');
        this._selectedChannel.set(null);
      }
    }
  }

  setActiveTab(tab: string): void {
    const previousTab = this._activeTab();
    this._activeTab.set(tab);
    
    if (tab === 'group') {
      this._sidebarExpanded.set(true);
      
      // 가입한 그룹이 있는 경우에만 기본 선택
      if (!this._selectedGroup() && this.hasJoinedGroups()) {
        const firstGroup = this.availableGroups()[0];
        this.setSelectedGroup(firstGroup.groupname);
        
        if (firstGroup.clubList.length > 0) {
          this.setSelectedChannel(firstGroup.clubList[0], firstGroup.groupname);
        }
      }
    } else {
      this._sidebarExpanded.set(false);
    }
    
    console.log(`Tab changed: ${previousTab} → ${tab}`, {
      selectedGroup: this._selectedGroup(),
      selectedChannel: this._selectedChannel(),
      sidebarExpanded: this._sidebarExpanded(),
      hasJoinedGroups: this.hasJoinedGroups()
    });
  }

  setSelectedGroup(groupId: string | null): void {
    if (!this.isValidGroup(groupId)) {
      console.warn('Invalid group ID:', groupId);
      return;
    }

    const previousGroup = this._selectedGroup();
    this._selectedGroup.set(groupId);
    this._selectedChannel.set(null);
    this.clearMessages();
    
    if (groupId && !this._expandedSections().includes(groupId)) {
      this._expandedSections.update(sections => {
        const sectionSet = new Set([...sections, groupId]);
        return Array.from(sectionSet);
      });
    }
    
    console.log(`Group changed: ${previousGroup} → ${groupId}`);
  }

  setSelectedChannel(channelId: string | null, groupId?: string): void {
    if (groupId && !this.isValidGroup(groupId)) {
      console.warn('Invalid group ID for channel:', groupId);
      return;
    }

    if (channelId && !this.isValidChannel(channelId, groupId || this._selectedGroup())) {
      console.warn('Invalid channel ID:', channelId);
      return;
    }

    const previousChannel = this._selectedChannel();
    
    if (groupId) {
      this._selectedGroup.set(groupId);
    }
    this._selectedChannel.set(channelId);
    this.clearMessages();
    
    if (channelId) {
      this.loadChannelMessages(channelId);
    }
    
    console.log(`Channel changed: ${previousChannel} → ${channelId}`, { groupId });
  }

  private isValidGroup(groupId: string | null): boolean {
    if (!groupId) return true;
    const joinList = this._userJoinList();
    return joinList?.joinList.some(g => g.groupname === groupId) || false;
  }

  private isValidChannel(channelId: string | null, groupId: string | null): boolean {
    if (!channelId || !groupId) return true;
    const joinList = this._userJoinList();
    const group = joinList?.joinList.find(g => g.groupname === groupId);
    return group?.clubList.includes(channelId) || false;
  }

  private setLoadingState(key: keyof LoadingState, loading: boolean): void {
    this._loadingState.update(state => ({
      ...state,
      [key]: loading
    }));
  }

  private setError(error: string | null): void {
    this._error.set(error);
  }

  clearError(): void {
    this.setError(null);
  }

  setCurrentUser(user: UserStatus | null): void {
    this._currentUser.set(user);
  }

  addMessage(message: ChatMessage): void {
    this._messages.update(messages => [...messages, message]);
    
    if (message.userId === this.currentUser()?.id) {
      setTimeout(() => {
        this.addBotResponse(message.content);
      }, 1000 + Math.random() * 2000);
    }
  }

  clearMessages(): void {
    this._messages.set([]);
  }

  toggleSidebar(): void {
    if (this._activeTab() === 'group') {
      this._sidebarExpanded.update(expanded => !expanded);
    }
  }

  setSidebarExpanded(expanded: boolean): void {
    this._sidebarExpanded.set(expanded);
  }

  toggleSection(sectionId: string): void {
    const wasExpanded = this._expandedSections().includes(sectionId);
    
    this._expandedSections.update(sections => {
      const sectionSet = new Set(sections);
      
      if (sectionSet.has(sectionId)) {
        sectionSet.delete(sectionId);
      } else {
        sectionSet.add(sectionId);
      }
      
      return Array.from(sectionSet);
    });

    if (!wasExpanded) {
      this.setSelectedGroup(sectionId);
    }
  }

  private addBotResponse(userMessage: string): void {
    const responses = [
      '좋은 아이디어네요! 👍',
      '저도 한번 시도해볼게요!',
      '정말 유용한 정보 감사합니다!',
      '함께 도전해봐요! 💪',
      '멋진 경험이었겠어요!',
      '더 자세히 알고 싶어요!'
    ];

    const botMessage: ChatMessage = {
      id: Date.now().toString(),
      userId: 'bot',
      username: '도우미',
      content: responses[Math.floor(Math.random() * responses.length)],
      timestamp: new Date(),
      type: 'text',
      channelId: this.selectedChannel() || 'general'
    };

    this._messages.update(messages => [...messages, botMessage]);
  }

  private async loadChannelMessages(channelId: string): Promise<void> {
    setTimeout(() => {
      const demoMessages = this.getDemoMessages(channelId);
      this._messages.set(demoMessages);
    }, 300);
  }

  private getDemoMessages(channelId: string): ChatMessage[] {
    return [];
  }

  private getTabTitle(tab: string): string {
    const titles: { [key: string]: string } = {
      'home': '홈',
      'group': '그룹',
      'activity': '통계',
      'member': '관리'
    };
    return titles[tab] || '홈';
  }

  private getGroupTitle(groupName: string): string {
    const joinList = this._userJoinList();
    const group = joinList?.joinList.find(g => g.groupname === groupName);
    return group?.groupname || groupName;
  }

  private getChannelTitle(groupName: string, channelName: string): string {
    return `${groupName} - ${channelName}`;
  }

  private getChannelName(channelId: string): string {
    return channelId;
  }

  private getChannelDescription(groupId: string, channelId: string): string {
    return `${groupId} 그룹의 ${channelId} 채널입니다.`;
  }

  getGroupChannels(groupName: string): string[] {
    const joinList = this._userJoinList();
    const group = joinList?.joinList.find(g => g.groupname === groupName);
    return group?.clubList || [];
  }

  findGroupForChannel(channelId: string): string | null {
    const joinList = this._userJoinList();
    if (!joinList) return null;

    for (const group of joinList.joinList) {
      if (group.clubList.includes(channelId)) {
        return group.groupname;
      }
    }
    return null;
  }

  isActiveTab(tab: string): boolean {
    return this.activeTab() === tab;
  }

  isActiveGroup(groupId: string): boolean {
    return this.selectedGroup() === groupId;
  }

  isActiveChannel(channelId: string): boolean {
    return this.selectedChannel() === channelId;
  }

  isSectionExpanded(sectionId: string): boolean {
    return this.expandedSections().includes(sectionId);
  }

  async restart(): Promise<void> {
    this.reset();
    await this.initializeUserData();
  }

  reset(): void {
    this._activeTab.set('home');
    this._selectedGroup.set(null);
    this._selectedChannel.set(null);
    this._currentUser.set(null);
    this._loadingState.set({
      user: false,
      userJoinList: false,
      groups: false,
      channels: false
    });
    this._messages.set([]);
    this._sidebarExpanded.set(false);
    this._expandedSections.set([]);
    this._userJoinList.set(null);
    this._initialized.set(false);
    this._error.set(null);
    this._navigationState.set({
      shouldRedirectToJoin: false,
      redirectReason: null,
      lastAttemptedTab: null
    });
    console.log('SharedStateService reset completed');
  }
}