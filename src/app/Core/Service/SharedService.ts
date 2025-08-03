import { Injectable, signal, computed } from '@angular/core';
import { UserStatus, UserJoinList } from '../Models/user';
import { ChatMessage } from '../../Channel/Models/chatMessage';
import { UserService } from './UserService';

@Injectable({
  providedIn: 'root'
})
export class SharedStateService {
  // === 기본 Signals ===
  private _activeTab = signal<string>('home');
  private _selectedGroup = signal<string | null>(null);
  private _selectedChannel = signal<string | null>(null);
  private _currentUser = signal<UserStatus | null>(null);
  private _isLoading = signal(false);
  private _messages = signal<ChatMessage[]>([]);
  private _sidebarExpanded = signal(false);
  private _expandedSections = signal<string[]>([]);
  private _userJoinList = signal<UserJoinList | null>(null);

  // === 읽기 전용 Signals (외부에서 직접 수정 불가) ===
  readonly activeTab = this._activeTab.asReadonly();
  readonly selectedGroup = this._selectedGroup.asReadonly();
  readonly selectedChannel = this._selectedChannel.asReadonly();
  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly sidebarExpanded = this._sidebarExpanded.asReadonly();
  readonly expandedSections = this._expandedSections.asReadonly();
  readonly userJoinList = this._userJoinList.asReadonly();

  // === Computed Signals ===
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

  readonly shouldShowSidebar = computed(() => 
    this.activeTab() === 'group'
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

  // === Constructor ===
  constructor(readonly userService: UserService) {
    this.initializeUserData();
  }

  private async initializeUserData(): Promise<void> {
    try {
      // 사용자 상태 로드
      const user = await this.userService.getUserStatus();
      if (user) {
        this.setCurrentUser(user);
      }

      // 사용자 가입 목록 로드
      const joinList = await this.userService.getUserJoinList();
      if (joinList) {
        this._userJoinList.set(joinList);
        // 첫 번째 그룹을 기본 확장 상태로 설정
        if (joinList.joinList.length > 0) {
          this._expandedSections.set([joinList.joinList[0].groupname]);
        }
      }
    } catch (error) {
      console.error('Error initializing user data:', error);
    }
  }

  // === Data Refresh ===
  async refreshUserJoinList(): Promise<void> {
    try {
      const joinList = await this.userService.getUserJoinList();
      if (joinList) {
        this._userJoinList.set(joinList);
        console.log('User join list refreshed in SharedState');
      }
    } catch (error) {
      console.error('Error refreshing user join list:', error);
    }
  }

  // === Tab Actions ===
  setActiveTab(tab: string): void {
    const previousTab = this._activeTab();
    this._activeTab.set(tab);
    
    // 그룹 탭이 아닌 경우 그룹/채널 선택 초기화
    if (tab !== 'group') {
      this._selectedGroup.set(null);
      this._selectedChannel.set(null);
      this._sidebarExpanded.set(false);
    } else {
      // 그룹 탭으로 돌아올 때
      this._sidebarExpanded.set(true);
    }
    
    console.log(`Tab changed: ${previousTab} → ${tab}`, {
      selectedGroup: this._selectedGroup(),
      sidebarExpanded: this._sidebarExpanded()
    });
  }

  // === Group Actions ===
  setSelectedGroup(groupId: string | null): void {
    const previousGroup = this._selectedGroup();
    this._selectedGroup.set(groupId);
    this._selectedChannel.set(null); // 그룹 변경 시 채널 초기화
    this.clearMessages(); // 그룹 변경 시 메시지 초기화
    
    // 그룹 선택 시 해당 섹션 확장
    if (groupId && !this._expandedSections().includes(groupId)) {
      this._expandedSections.update(sections => [...sections, groupId]);
    }
    
    console.log(`Group changed: ${previousGroup} → ${groupId}`);
  }

  // === Channel Actions ===  
  setSelectedChannel(channelId: string | null, groupId?: string): void {
    const previousChannel = this._selectedChannel();
    
    if (groupId) {
      this._selectedGroup.set(groupId);
    }
    this._selectedChannel.set(channelId);
    this.clearMessages(); // 채널 변경 시 메시지 초기화
    
    // 채널별 데모 메시지 로드
    if (channelId) {
      this.loadChannelMessages(channelId);
    }
    
    console.log(`Channel changed: ${previousChannel} → ${channelId}`, { groupId });
  }

  // === Sidebar Actions ===
  toggleSidebar(): void {
    this._sidebarExpanded.update(expanded => !expanded);
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

    // 섹션을 새로 펼칠 때만 그룹 선택
    if (!wasExpanded) {
      this.setSelectedGroup(sectionId);
    }
  }

  // === User Actions ===
  setCurrentUser(user: UserStatus | null): void {
    this._currentUser.set(user);
  }

  // === Loading Actions ===
  setLoading(loading: boolean): void {
    this._isLoading.set(loading);
  }

  // === Message Actions ===
  addMessage(message: ChatMessage): void {
    this._messages.update(messages => [...messages, message]);
    
    // 데모용 자동 응답
    if (message.userId === this.currentUser()?.id) {
      setTimeout(() => {
        this.addBotResponse(message.content);
      }, 1000 + Math.random() * 2000);
    }
  }

  clearMessages(): void {
    this._messages.set([]);
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
      type: 'text'
    };

    this._messages.update(messages => [...messages, botMessage]);
  }

  private loadChannelMessages(channelId: string): void {
    // 실제 환경에서는 MessageService나 ChatService를 통해 로드
    // 여기서는 데모 메시지 로드
    setTimeout(() => {
      const demoMessages = this.getDemoMessages(channelId);
      this._messages.set(demoMessages);
    }, 300);
  }

  private getDemoMessages(channelId: string): ChatMessage[] {
    // 실제로는 API에서 가져올 데이터
    const messageMap: { [key: string]: ChatMessage[] } = {
      // 기본 데모 메시지들
    };
    
    return messageMap[channelId] || [];
  }

  // === Helper Methods ===
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
    // userJoinList에서 실제 그룹명 반환
    const joinList = this._userJoinList();
    const group = joinList?.joinList.find(g => g.groupname === groupName);
    return group?.groupname || groupName;
  }

  private getChannelTitle(groupName: string, channelName: string): string {
    // userJoinList 구조에 맞게 그룹명과 채널명 조합
    return `${groupName} - ${channelName}`;
  }

  private getChannelName(channelId: string): string {
    // userJoinList에서는 채널 ID만 제공되므로 그대로 반환
    // 별도의 display name이 필요하다면 추가 Service에서 가져와야 함
    return channelId;
  }

  private getChannelDescription(groupId: string, channelId: string): string {
    // userJoinList에는 description이 없으므로 기본 설명 제공
    // 상세 정보가 필요하다면 별도 GroupService/ChannelService 필요
    return `${groupId} 그룹의 ${channelId} 채널입니다.`;
  }

  // === Group/Channel Helpers ===
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

  // === Utility Methods ===
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

  // === Reset ===
  reset(): void {
    this._activeTab.set('home');
    this._selectedGroup.set(null);
    this._selectedChannel.set(null);
    this._isLoading.set(false);
    this._messages.set([]);
    this._sidebarExpanded.set(false);
    this._expandedSections.set([]);
    console.log('State reset completed');
  }
}