import { Injectable, signal, computed, effect } from '@angular/core';
import { UserStatus, UserJoinList } from '../Models/user';
import { ChatMessage } from '../../Channel/Models/chatMessage';
import { UserService } from './UserService';
import { firstValueFrom } from 'rxjs';
import { DebugService } from '../../Debug/DebugService';

export interface LoadingState {
  user: boolean;
  userJoinList: boolean;
  groups: boolean;
  channels: boolean;
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
  private _sidebarExpanded = signal(false); // 그룹바 표시 여부
  private _expandedSections = signal<string[]>([]);
  private _userJoinList = signal<UserJoinList | null>(null);
  private _initialized = signal(false);
  private _error = signal<string | null>(null);

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

  // 사이드바 표시 로직 변경: 메뉴바는 항상, 그룹바는 그룹 탭에서만
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

  // === Constructor ===
  constructor(private userService: UserService, private debugService: DebugService) {
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
        this.debugService.printConsole('SharedStateService Error:', error);
      }
    });
  }

  // === 초기화 메서드 (개선됨) ===
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
        this.debugService.printConsole('Failed to load user status:', user.reason);
        this.setError('사용자 정보를 불러올 수 없습니다.');
      }

      // 가입 목록 처리
      if (joinList.status === 'fulfilled' && joinList.value) {
        this._userJoinList.set(joinList.value);
        this.initializeDefaultSelections(joinList.value);
      } else if (joinList.status === 'rejected') {
        this.debugService.printConsole('Failed to load user join list:', joinList.reason);
        this.setError('가입 목록을 불러올 수 없습니다.');
      }

      this._initialized.set(true);
      this.debugService.printConsole('SharedStateService initialized successfully');

    } catch (error) {
      this.debugService.printConsole('Error initializing SharedStateService:', error);
      this.setError('초기화 중 오류가 발생했습니다.');
    } finally {
      this.setLoadingState('user', false);
      this.setLoadingState('userJoinList', false);
    }
  }

  private async loadUserStatus(): Promise<UserStatus | null> {
    try {
      return await this.userService.getUserStatus() || null;
    } catch (error) {
      this.debugService.printConsole('Error loading user status:', error);
      throw error;
    }
  }

  private async loadUserJoinList(): Promise<UserJoinList | null> {
    try {
      return await this.userService.getUserJoinList() || null;
    } catch (error) {
      this.debugService.printConsole('Error loading user join list:', error);
      throw error;
    }
  }

  private initializeDefaultSelections(joinList: UserJoinList): void {
    if (joinList.joinList.length > 0) {
      const firstGroup = joinList.joinList[0];
      
      // 첫 번째 그룹을 확장 상태로 설정
      this._expandedSections.set([firstGroup.groupname]);
      
      // 그룹 탭일 때만 자동 선택
      if (this.activeTab() === 'group') {
        this.setSelectedGroup(firstGroup.groupname);
        
        // 첫 번째 채널도 자동 선택
        if (firstGroup.clubList.length > 0) {
          this.setSelectedChannel(firstGroup.clubList[0], firstGroup.groupname);
        }
      }
    }
  }

  // === 강화된 데이터 새로고침 ===
  async refreshUserJoinList(): Promise<void> {
    this.setLoadingState('userJoinList', true);
    try {
      // 캐시 무효화
      this.userService['cacheService']?.removeCache('userJoinList');
      
      const joinList = await this.loadUserJoinList();
      if (joinList) {
        this._userJoinList.set(joinList);
        this.debugService.printConsole('User join list refreshed successfully');
        
        // 선택된 그룹/채널이 여전히 유효한지 확인
        this.validateCurrentSelections();
      }
    } catch (error) {
      this.debugService.printConsole('Error refreshing user join list:', error);
      this.setError('가입 목록 새로고침에 실패했습니다.');
    } finally {
      this.setLoadingState('userJoinList', false);
    }
  }

  async refreshUserStatus(): Promise<void> {
    this.setLoadingState('user', true);
    try {
      // 캐시 무효화
      this.userService['cacheService']?.removeCache('userStatus');
      
      const user = await this.loadUserStatus();
      if (user) {
        this.setCurrentUser(user);
        this.debugService.printConsole('User status refreshed successfully');
      }
    } catch (error) {
      this.debugService.printConsole('Error refreshing user status:', error);
      this.setError('사용자 상태 새로고침에 실패했습니다.');
    } finally {
      this.setLoadingState('user', false);
    }
  }

  // === 선택 유효성 검증 ===
  private validateCurrentSelections(): void {
    const joinList = this._userJoinList();
    if (!joinList) return;

    const selectedGroup = this._selectedGroup();
    const selectedChannel = this._selectedChannel();

    // 선택된 그룹이 여전히 유효한지 확인
    if (selectedGroup) {
      const group = joinList.joinList.find(g => g.groupname === selectedGroup);
      if (!group) {
        this.debugService.printConsole('Selected group no longer exists, clearing selection');
        this._selectedGroup.set(null);
        this._selectedChannel.set(null);
        return;
      }

      // 선택된 채널이 여전히 유효한지 확인
      if (selectedChannel && !group.clubList.includes(selectedChannel)) {
        this.debugService.printConsole('Selected channel no longer exists, clearing channel selection');
        this._selectedChannel.set(null);
      }
    }
  }

  // === 개선된 탭 액션 ===
  setActiveTab(tab: string): void {
    const previousTab = this._activeTab();
    this._activeTab.set(tab);
    
    if (tab === 'group') {
      // 그룹 탭으로 전환 시 그룹바 표시
      this._sidebarExpanded.set(true);
      
      // 기본 그룹/채널 선택이 없으면 첫 번째 항목 선택
      if (!this._selectedGroup() && this.availableGroups().length > 0) {
        const firstGroup = this.availableGroups()[0];
        this.setSelectedGroup(firstGroup.groupname);
        
        if (firstGroup.clubList.length > 0) {
          this.setSelectedChannel(firstGroup.clubList[0], firstGroup.groupname);
        }
      }
    } else {
      // 다른 탭일 때는 그룹바만 숨김 (메뉴바는 항상 표시)
      this._sidebarExpanded.set(false);
      // 그룹/채널 선택은 유지 (다시 그룹 탭으로 돌아왔을 때 복원)
    }
    
    this.debugService.printConsole(`Tab changed: ${previousTab} → ${tab}`, {
      selectedGroup: this._selectedGroup(),
      selectedChannel: this._selectedChannel(),
      sidebarExpanded: this._sidebarExpanded()
    });
  }

  // === 개선된 그룹 액션 ===
  setSelectedGroup(groupId: string | null): void {
    if (!this.isValidGroup(groupId)) {
      this.debugService.printConsole('Invalid group ID:', groupId);
      return;
    }

    const previousGroup = this._selectedGroup();
    this._selectedGroup.set(groupId);
    this._selectedChannel.set(null);
    this.clearMessages();
    
    if (groupId && !this._expandedSections().includes(groupId)) {
      this._expandedSections.update(sections => [...sections, groupId]);
    }
    
    this.debugService.printConsole(`Group changed: ${previousGroup} → ${groupId}`);
  }

  // === 개선된 채널 액션 ===  
  setSelectedChannel(channelId: string | null, groupId?: string): void {
    if (groupId && !this.isValidGroup(groupId)) {
      this.debugService.printConsole('Invalid group ID for channel:', groupId);
      return;
    }

    if (channelId && !this.isValidChannel(channelId, groupId || this._selectedGroup())) {
      this.debugService.printConsole('Invalid channel ID:', channelId);
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
    
    this.debugService.printConsole(`Channel changed: ${previousChannel} → ${channelId}`, { groupId });
  }

  // === 유효성 검증 헬퍼 ===
  private isValidGroup(groupId: string | null): boolean {
    if (!groupId) return true; // null은 유효 (선택 해제)
    const joinList = this._userJoinList();
    return joinList?.joinList.some(g => g.groupname === groupId) || false;
  }

  private isValidChannel(channelId: string | null, groupId: string | null): boolean {
    if (!channelId || !groupId) return true;
    const joinList = this._userJoinList();
    const group = joinList?.joinList.find(g => g.groupname === groupId);
    return group?.clubList.includes(channelId) || false;
  }

  // === 로딩 상태 관리 ===
  private setLoadingState(key: keyof LoadingState, loading: boolean): void {
    this._loadingState.update(state => ({
      ...state,
      [key]: loading
    }));
  }

  // === 에러 상태 관리 ===
  private setError(error: string | null): void {
    this._error.set(error);
  }

  clearError(): void {
    this.setError(null);
  }

  // === 기존 메서드들 (개선됨) ===
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

  // 그룹바만 토글 (메뉴바는 항상 표시)
  toggleSidebar(): void {
    // 그룹 탭에서만 토글 허용
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

  // === 헬퍼 메서드들 ===
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
    // 실제 환경에서는 MessageService 사용
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

  // === 유틸리티 메서드들 ===
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

  // === 재시작 ===
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
    this.debugService.printConsole('SharedStateService reset completed');
  }
}