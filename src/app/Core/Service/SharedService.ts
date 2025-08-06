import { Injectable, signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { UserStatus, UserJoinList } from '../Models/user';
import { ChatMessage } from '../../Channel/Models/chatMessage';
import { UserService } from './UserService';

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

  readonly shouldShowSidebar = computed(() => true);

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

  // === Constructor ===
  constructor(private userService: UserService, private router: Router) {
    // 초기화 효과
    effect(() => {
      if (!this.initialized()) {
        this.initializeUserData();
      }
    });

    // 에러 상태 모니터링
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

      // 가입 목록 처리
      if (joinList.status === 'fulfilled' && joinList.value) {
        this._userJoinList.set(joinList.value);
        console.log('User join list loaded:', joinList.value);
      } else if (joinList.status === 'rejected') {
        console.error('Failed to load user join list:', joinList.reason);
        this.setError('가입 목록을 불러올 수 없습니다.');
      }

      this._initialized.set(true);
      console.log('SharedStateService initialized successfully');

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

  // === 기존 메서드들 유지 ===
  async refreshUserJoinList(): Promise<void> {
    this.setLoadingState('userJoinList', true);
    try {
      this.userService['cacheService']?.removeCache('userJoinList');
      
      const joinList = await this.loadUserJoinList();
      if (joinList) {
        this._userJoinList.set(joinList);
        console.log('User join list refreshed successfully');
        this.validateCurrentSelections();
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

  private async loadUserStatus(): Promise<UserStatus | null> {
    try {
      return await this.userService.getUserStatus() || null;
    } catch (error) {
      console.error('Error loading user status:', error);
      throw error;
    }
  }

  private async loadUserJoinList(): Promise<UserJoinList | null> {
    try {
      return await this.userService.getUserJoinList() || null;
    } catch (error) {
      console.error('Error loading user join list:', error);
      throw error;
    }
  }

  // === 나머지 기존 메서드들은 동일하게 유지 ===
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
      this._expandedSections.update(sections => [...sections, groupId]);
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

  // [기존의 다른 메서드들은 모두 동일하게 유지]
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

  // [나머지 모든 기존 메서드들 동일하게 유지]
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
      if (sections.includes(sectionId)) {
        return sections.filter(id => id !== sectionId);
      } else {
        return [...sections, sectionId];
      }
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