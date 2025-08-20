// SharedService.ts - 개선된 버전 (동적 그룹/채널 추가 지원)
import { Injectable, signal, computed, effect } from '@angular/core';
import { UserStatus, UserJoin } from '../Models/user';
import { SimpleChatMessage } from '../../Channel/Models/chatMessage';
import { UserService } from './UserService';
import { GroupService } from './GroupService'; // 추가
import { Group } from '../Models/group'; // 추가

// 타입 정의
type JoinListItem = {
  groupId: number;
  groupname: string;
  clubList: Club[];
}

type Club = {
  clubId: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoadingState {
  user: boolean;
  userJoin: boolean;
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
    userJoin: false,
    groups: false,
    channels: false
  });
  private _sidebarExpanded = signal(false);
  private _expandedSections = signal<string[]>([]);
  public _userJoin = signal<UserJoin | null>(null);
  private _groupList = signal<{id: number, name: string}[]>([]);
  private _clubList = signal<{id: number, name: string, groupId: number}[]>([]);
  private _initialized = signal(false);
  private _error = signal<string | null>(null);
  private _selectedChannelInfo = signal<{id: number, name: string, groupId: number} | null>(null);

  // === 읽기 전용 Signals ===
  readonly activeTab = this._activeTab.asReadonly();
  readonly selectedGroup = this._selectedGroup.asReadonly();
  readonly selectedChannel = this._selectedChannel.asReadonly();
  readonly groupList = this._groupList.asReadonly();
  readonly clubList = this._clubList.asReadonly();
  readonly currentUser = this._currentUser.asReadonly();
  readonly loadingState = this._loadingState.asReadonly();
  readonly sidebarExpanded = this._sidebarExpanded.asReadonly();
  readonly expandedSections = this._expandedSections.asReadonly();
  readonly userJoin = this._userJoin.asReadonly();
  readonly initialized = this._initialized.asReadonly();
  readonly error = this._error.asReadonly();
  readonly selectedChannelInfo = this._selectedChannelInfo.asReadonly();

  // === Computed Signals ===
  readonly isLoading = computed(() => {
    const state = this.loadingState();
    return state.user || state.userJoin || state.groups || state.channels;
  });

  readonly isChannelSelected = computed(() => 
    this.selectedChannel() !== null
  );

  readonly isGroupSelected = computed(() => 
    this.selectedGroup() !== null
  );

  readonly availableGroups = computed(() => {
    return this.userJoin()?.joinList || [];
  });

  // 실제 club ID를 반환하는 computed 추가
  readonly currentChannelWithId = computed(() => {
    const selectedChannel = this.selectedChannel();
    const selectedGroup = this.selectedGroup();
    
    if (!selectedChannel || !selectedGroup) {
      return { id: -1, name: '', groupId: -1 };
    }

    // groupList에서 그룹 ID 찾기
    const group = this._groupList().find(g => g.name === selectedGroup);
    if (!group) {
      console.warn('Group not found in groupList:', selectedGroup);
      return { id: -1, name: selectedChannel, groupId: -1 };
    }
    
    // clubList에서 실제 club ID 찾기
    const club = this._clubList().find(c => 
      c.name === selectedChannel && c.groupId === group.id
    );
    
    if (!club) {
      console.warn('Club not found in clubList:', { selectedChannel, groupId: group.id });
      return { id: -1, name: selectedChannel, groupId: group.id };
    }
    
    return {
      id: club.id,
      name: club.name,
      groupId: club.groupId
    };
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
    return this.initialized() && this.currentUser() !== null && this.userJoin() !== null;
  });

  readonly hasJoinedGroups = computed(() => {
    const joinList = this.userJoin();
    return joinList ? joinList.joinList.length > 0 : false;
  });

  // === Constructor ===
  constructor(
    private userService: UserService,
    private groupService: GroupService // 추가
  ) {
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
  }

  // === 초기화 메서드 (GroupService 연동) ===
  private async initializeUserData(): Promise<void> {
    if (this.initialized()) return;

    try {
      this.setError(null);
      this.setLoadingState('user', true);
      this.setLoadingState('userJoin', true);
      this.setLoadingState('groups', true); // 추가

      // 1. 모든 그룹 목록 먼저 로드 (ID 정보 확보용)
      const groupList = await this.loadGroupList();
      this.processGroupList(groupList);

      // 2. 병렬로 사용자 데이터 로드
      const [user, joinList] = await Promise.allSettled([
        this.loadUserStatus(),
        this.loadUserJoin()
      ]);

      // 3. 사용자 상태 처리
      if (user.status === 'fulfilled' && user.value) {
        this.setCurrentUser(user.value);
      } else if (user.status === 'rejected') {
        this.setError('사용자 정보를 불러올 수 없습니다.');
      }

      // 4. 가입 목록 처리
      if (joinList.status === 'fulfilled') {
        const joinListData = joinList.value || { id: '', joinList: [] };
        this._userJoin.set(joinListData);
        
        // 가입한 그룹이 있는 경우에만 기본 선택 설정
        if (joinListData.joinList.length > 0) {
          this.processUserJoinList(joinListData);
          this.initializeDefaultSelections(joinListData);
        } else {
        }
      } else if (joinList.status === 'rejected') {
        console.error('❌ 가입 목록 로드 실패:', joinList.reason);
        this._userJoin.set({ id: '', joinList: [] });
      }

      this._initialized.set(true);
    } catch (error) {
      this.setError('초기화 중 오류가 발생했습니다.');
    } finally {
      this.setLoadingState('user', false);
      this.setLoadingState('userJoin', false);
      this.setLoadingState('groups', false);
    }
  }

  // 새로 추가: 그룹 목록 로드
  private async loadGroupList(): Promise<Group[]> {
    try {
      const groups = await this.groupService.getGroupList();
      return groups;
    } catch (error) {
      return [];
    }
  }

  // 새로 추가: 그룹 목록 처리
  private processGroupList(groups: Group[]): void {
    const groupList: {id: number, name: string}[] = [];
    const clubList: {id: number, name: string, groupId: number}[] = [];

    groups.forEach(group => {
      // 그룹 정보 추가
      groupList.push({
        id: group.id,
        name: group.name
      });

      // 해당 그룹의 클럽들 추가
      if (group.clubList && group.clubList.length > 0) {
        group.clubList.forEach(club => {
          clubList.push({
            id: club.clubId,
            name: club.name,
            groupId: group.id
          });
        });
      }
    });

    this._groupList.set(groupList);
    this._clubList.set(clubList);
  }

  // 새로 추가: 사용자 가입 목록 처리
  private processUserJoinList(joinList: UserJoin): void {
    
    joinList.joinList.forEach(userGroup => {
      // 이미 groupList에 있는지 확인
      const existingGroup = this._groupList().find(g => g.id === userGroup.groupId);
      if (!existingGroup) {
        console.log(`⚠️ 그룹 목록에 없는 그룹 추가: ${userGroup.groupname}`);
        this.addListGroup(userGroup.groupId, userGroup.groupname);
      }

      // 클럽들도 처리
      userGroup.clubList.forEach(club => {
        const existingClub = this._clubList().find(c => c.id === club.clubId);
        if (!existingClub) {
          console.log(`⚠️ 클럽 목록에 없는 클럽 추가: ${club.name}`);
          this.addListClub(club.clubId, club.name, userGroup.groupId);
        }
      });
    });

    console.log('✅ 사용자 가입 목록 처리 완료');
  }

  private async loadUserStatus(): Promise<UserStatus | null> {
    try {
      return await this.userService.getUserStatus() || null;
    } catch (error) {
      console.error('Error loading user status:', error);
      throw error;
    }
  }

  private async loadUserJoin(): Promise<UserJoin | null> {
    try {
      return await this.userService.getUserJoin() || null;
    } catch (error) {
      console.error('Error loading user join list:', error);
      throw error;
    }
  }

  private initializeDefaultSelections(joinList: UserJoin): void {
    if (joinList.joinList.length > 0) {
      const firstGroup = joinList.joinList[0];
      
      // 첫 번째 그룹을 확장 상태로 설정
      this._expandedSections.set([firstGroup.groupname]);
      
      // 그룹 탭일 때만 자동 선택
      if (this.activeTab() === 'group') {
        this.setSelectedGroup(firstGroup.groupname);
        
        // 첫 번째 채널도 자동 선택
        if (firstGroup.clubList.length > 0) {
          this.setSelectedChannel(firstGroup.clubList[0].name, firstGroup.groupname);
        }
      }
    }
  }

  setSelectedChannel(channelId: string | null, groupId?: string, channelName?: string): void {
      console.log('🎯 setSelectedChannel 호출:', { channelId, groupId, channelName });
      
      if (groupId && !this.isValidGroup(groupId)) {
          console.warn('❌ 유효하지 않은 그룹 ID:', groupId);
          return;
      }

      if (channelId && !this.isValidChannel(channelId, groupId || this._selectedGroup())) {
          console.warn('❌ 유효하지 않은 채널 ID:', channelId);
          return;
      }

      const previousChannel = this._selectedChannel();
      
      if (groupId) {
          this._selectedGroup.set(groupId);
      }
      this._selectedChannel.set(channelId);
      
      // 채널 상세 정보 저장 (실제 clubId 사용)
      if (channelId && (groupId || this._selectedGroup())) {
          const targetGroupName = groupId || this._selectedGroup();
          
          // 1. 그룹 목록에서 그룹 찾기
          const group = this._groupList().find(g => g.name === targetGroupName);
          
          if (group) {
              // 2. 클럽 목록에서 해당 그룹의 클럽 찾기
              const club = this._clubList().find(c => 
                  c.name === channelId && c.groupId === group.id
              );
              
              if (club) {
                  this._selectedChannelInfo.set({
                      id: club.id, // 실제 clubId
                      name: channelName || channelId,
                      groupId: group.id // 실제 groupId
                  });
                  
                  console.log('✅ 채널 정보 설정 완료:', {
                      channelName: channelId,
                      clubId: club.id, // 실제 clubId
                      groupName: targetGroupName,
                      groupId: group.id
                  });
              } else {
                  // 클럽을 찾을 수 없는 경우, 사용자 가입 목록에서 찾기 (fallback)
                  console.warn('⚠️ 전체 클럽 목록에서 클럽을 찾을 수 없음, 사용자 가입 목록에서 검색...');
                  
                  const userJoin = this._userJoin();
                  if (userJoin) {
                      const userGroup = userJoin.joinList.find(g => g.groupname === targetGroupName);
                      if (userGroup) {
                          const userClub = userGroup.clubList.find(c => c.name === channelId);
                          if (userClub) {
                              this._selectedChannelInfo.set({
                                  id: userClub.clubId, // 사용자 가입 목록의 clubId
                                  name: channelName || channelId,
                                  groupId: userGroup.groupId
                              });
                              
                              console.log('✅ 사용자 가입 목록에서 채널 정보 설정:', {
                                  channelName: channelId,
                                  clubId: userClub.clubId,
                                  groupName: targetGroupName,
                                  groupId: userGroup.groupId
                              });
                          } else {
                              console.error('❌ 사용자 가입 목록에서도 클럽을 찾을 수 없음:', { channelId, groupId: userGroup.groupId });
                              this._selectedChannelInfo.set(null);
                          }
                      } else {
                          console.error('❌ 사용자 가입 목록에서 그룹을 찾을 수 없음:', targetGroupName);
                          this._selectedChannelInfo.set(null);
                      }
                  } else {
                      console.error('❌ 사용자 가입 목록이 없음');
                      this._selectedChannelInfo.set(null);
                  }
              }
          } else {
              console.warn('❌ 그룹을 찾을 수 없음:', targetGroupName);
              this._selectedChannelInfo.set(null);
          }
      } else {
          this._selectedChannelInfo.set(null);
      }
      
      if (channelId) {
          this.loadChannelMessages(channelId);
      }
  }

  setSelectedChannelByClubId(clubId: number, channelName?: string, groupName?: string): void {
      // 클럽 목록에서 clubId로 클럽 찾기
      const club = this._clubList().find(c => c.id === clubId);
      
      if (!club) {
          console.error('❌ clubId로 클럽을 찾을 수 없음:', clubId);
          return;
      }

      // 그룹 찾기
      const group = this._groupList().find(g => g.id === club.groupId);
      
      if (!group) {
          console.error('❌ 클럽의 그룹을 찾을 수 없음:', { clubId, groupId: club.groupId });
          return;
      }

      // 그룹과 채널 선택
      this._selectedGroup.set(group.name);
      this._selectedChannel.set(club.name);
      
      // 채널 정보 설정
      this._selectedChannelInfo.set({
          id: club.id,
          name: channelName || club.name,
          groupId: group.id
      });
  }

  // 디버깅 메서드 추가
  debugChannelSelection(): void {
    console.log('=== 채널 선택 디버그 정보 ===');
    console.log('선택된 그룹:', this.selectedGroup());
    console.log('선택된 채널:', this.selectedChannel());
    console.log('현재 채널 정보:', this.currentChannelWithId());
    console.log('선택된 채널 정보:', this.selectedChannelInfo());
    console.log('사용자 가입 목록:', this.userJoin());
    console.log('전체 그룹 목록:', this.groupList());
    console.log('전체 클럽 목록:', this.clubList());
    
    const joinList = this.userJoin();
    if (joinList && this.selectedGroup()) {
      const group = joinList.joinList.find(g => g.groupname === this.selectedGroup());
      console.log('선택된 그룹의 클럽들:', group?.clubList);
    }
  }

  // 나머지 기존 메서드들은 동일하게 유지...
  // (공간 절약을 위해 생략, 실제로는 모든 메서드가 필요함)

  // 필수 메서드들만 포함
  private isValidGroup(groupId: string | null): boolean {
    if (!groupId) return true;
    const joinList = this._userJoin();
    return joinList?.joinList.some(g => g.groupname === groupId) || false;
  }

  private isValidChannel(clubName: string | null, groupName: string | null): boolean {
    if (!clubName || !groupName) return true;
    const joinList = this._userJoin();
    const group = joinList?.joinList.find(g => g.groupname === groupName);
    return group?.clubList.some(club => club.name === clubName) || false;
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

  // 기타 필수 헬퍼 메서드들
  addListGroup(groupId: number, groupName: string) {
    const existingGroupNames = new Set(this._groupList().map(group => group.name));
    if (existingGroupNames.has(groupName)) {
      return;
    }

    const newGroupItem = { id: groupId, name: groupName };
    const updatedGroupList = [...this._groupList(), newGroupItem];
    this._groupList.set(updatedGroupList);
  }

  addListClub(clubId: number, clubName: string, groupId: number) {
    const existingClubNames = new Set(this._clubList().map(club => club.name));
    if (existingClubNames.has(clubName)) {
      return;
    }

    const newClubItem = { id: clubId, name: clubName, groupId: groupId };
    const updatedClubList = [...this._clubList(), newClubItem];
    this._clubList.set(updatedClubList);
  }

  private async loadChannelMessages(channelId: string): Promise<void> {
    // 기존 로직 유지
    setTimeout(() => {
      const demoMessages = this.getDemoMessages(channelId);
    }, 300);
  }

  private getDemoMessages(channelId: string): SimpleChatMessage[] {
    return [];
  }

  private getTabTitle(tab: string): string {
    const titles: { [key: string]: string } = {
      'home': '홈',
      'group': '그룹', 
      'activity': '통계',
      'member': '관리',
      'donation': '기부하기'  // 추가
    };
    return titles[tab] || '홈';
  }

  private getGroupTitle(groupName: string): string {
    return groupName;
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

  // 필수 getter 메서드들
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

  addUserGroup(groupid: number, groupName: string): void {
    const currentJoinList = this._userJoin();
    
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
      groupId: groupid,
      groupname: groupName,
      clubList: []
    };

    const updatedJoinList: UserJoin = {
      ...currentJoinList,
      joinList: [...currentJoinList.joinList, newGroupItem]
    };

    this._userJoin.set(updatedJoinList);
    
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

  addUserChannels(groupName: string, clubs: Club[]): void {
    const currentJoinList = this._userJoin();
    
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
    const newChannelSet = new Set([...existingChannelSet, ...clubs]);
    const newChannels = Array.from(newChannelSet).filter(channel => !existingChannelSet.has(channel));
    
    if (newChannels.length === 0) {
      console.log('No new channels to add for group:', groupName);
      return;
    }

    // Set으로 중복 제거된 전체 채널 목록 생성
    targetGroup.clubList = Array.from(newChannelSet);
    updatedJoinList.joinList[groupIndex] = targetGroup;
    
    this._userJoin.set(updatedJoinList);

    // 첫 번째 채널이라면 자동 선택 (그룹이 현재 선택된 상태에서)
    if (existingChannelSet.size === 0 && 
        this.selectedGroup() === groupName && 
        !this.selectedChannel() &&
        newChannels.length > 0) {
      this.setSelectedChannel(newChannels[0].name, groupName);
    }
  }

  /**
   * 그룹과 채널을 한번에 추가 (GroupJoin에서 사용)
   */
  addUserGroupWithChannels(groupId: number, groupName: string, clubs: Club[]): void {
    console.log('🔄 addUserGroupWithChannels 시작:', {
      groupId,
      groupName,
      clubsCount: clubs.length,
      clubs: clubs.map(c => `${c.name}(ID:${c.clubId})`)
    });
    
    const currentJoinList = this._userJoin();
    
    if (!currentJoinList) {
      console.error('❌ Cannot add group with channels - no join list initialized');
      return;
    }

    // 중복 그룹 확인
    const existingGroupIndex = currentJoinList.joinList.findIndex(item => item.groupname === groupName);
    
    if (existingGroupIndex !== -1) {
      // 기존 그룹이 있는 경우: 채널만 추가 (중복 제거)
      console.log('📝 기존 그룹에 채널 추가:', groupName);
      
      const existingGroup = { ...currentJoinList.joinList[existingGroupIndex] };
      const existingChannels = existingGroup.clubList || [];
      
      // 기존 채널명 세트 생성
      const existingChannelNames = new Set(
        existingChannels.map(club => typeof club === 'string' ? club : club.name)
      );
      
      // 새로운 채널만 필터링
      const newChannels = clubs.filter(club => !existingChannelNames.has(club.name));
      
      if (newChannels.length > 0) {
        console.log('➕ 추가할 새 채널:', newChannels.map(c => c.name));
        
        // 기존 채널과 새 채널 합치기
        const updatedClubList = [...existingChannels, ...newChannels];
        const updatedGroup = {
          ...existingGroup,
          clubList: updatedClubList
        };
        
        // 업데이트된 그룹으로 교체
        const updatedJoinList = {
          ...currentJoinList,
          joinList: currentJoinList.joinList.map((group, index) => 
            index === existingGroupIndex ? updatedGroup : group
          )
        };
        
        this._userJoin.set(updatedJoinList);
        console.log('✅ 기존 그룹에 채널 추가 완료');
      } else {
        console.log('ℹ️ 추가할 새 채널 없음 (모든 채널이 이미 존재)');
      }
      
    } else {
      // 새 그룹인 경우: 그룹과 채널을 함께 추가
      console.log('📝 새 그룹과 채널 추가:', groupName);
      
      // 채널 중복 제거 (안전장치)
      const uniqueChannels = clubs.filter((club, index, array) => 
        array.findIndex(c => c.name === club.name) === index
      );
      
      console.log('📋 최종 채널 목록:', uniqueChannels.map(c => `${c.name}(ID:${c.clubId})`));
      
      const newGroupItem: JoinListItem = {
        groupId: groupId,
        groupname: groupName,
        clubList: uniqueChannels
      };

      const updatedJoinList: UserJoin = {
        ...currentJoinList,
        joinList: [...currentJoinList.joinList, newGroupItem]
      };

      this._userJoin.set(updatedJoinList);
      
      // 확장된 섹션에 추가 (중복 방지)
      this._expandedSections.update(sections => {
        const sectionSet = new Set([...sections, groupName]);
        return Array.from(sectionSet);
      });

      console.log('✅ 새 그룹과 채널 추가 완료');
    }

    // 업데이트 후 상태 검증
    this.validateGroupChannelConsistency(groupName, clubs);
    
    // 첫 번째 그룹이거나 선택된 그룹이 없다면 자동 선택 (그룹 탭에서만)
    if (this.activeTab() === 'group') {
      if (currentJoinList.joinList.length === 0 || !this.selectedGroup()) {
        console.log('🎯 새 그룹을 자동 선택:', groupName);
        this.setSelectedGroup(groupName);
        
        if (clubs.length > 0) {
          const firstChannelName = clubs[0].name;
          console.log('🎯 첫 번째 채널을 자동 선택:', firstChannelName);
          this.setSelectedChannel(firstChannelName, groupName);
        }
      }
    }
    
    console.log('🎉 addUserGroupWithChannels 완료');
  }

  private validateGroupChannelConsistency(groupName: string, expectedChannels: Club[]): void {
    console.log('🔍 그룹-채널 일관성 검증 시작:', groupName);
    
    const currentJoinList = this._userJoin();
    if (!currentJoinList) {
      console.error('❌ UserJoin 데이터 없음');
      return;
    }
    
    const targetGroup = currentJoinList.joinList.find(g => g.groupname === groupName);
    if (!targetGroup) {
      console.error('❌ 그룹을 찾을 수 없음:', groupName);
      return;
    }
    
    const actualChannels = targetGroup.clubList || [];
    const expectedChannelNames = expectedChannels.map(c => c.name);
    
    console.log('📊 채널 일관성 검증:', {
      그룹: groupName,
      기대채널수: expectedChannelNames.length,
      실제채널수: actualChannels.length,
      기대채널: expectedChannelNames,
      실제채널: actualChannels.map(c => typeof c === 'string' ? c : c.name)
    });
    
    // 모든 기대하는 채널이 실제로 존재하는지 확인
    const missingChannels = expectedChannelNames.filter(name => 
      !actualChannels.some(c => (typeof c === 'string' ? c : c.name) === name)
    );
    
    if (missingChannels.length > 0) {
      console.warn('⚠️ 누락된 채널:', missingChannels);
    } else {
      console.log('✅ 모든 채널이 정상적으로 추가됨');
    }
    
    // 추가: 다른 그룹의 채널이 잘못 포함되었는지 확인
    this.detectCrossGroupChannelContamination(groupName);
  }

  private detectCrossGroupChannelContamination(targetGroupName: string): void {
    console.log('🔍 교차 그룹 채널 오염 감지:', targetGroupName);
    
    const currentJoinList = this._userJoin();
    if (!currentJoinList || currentJoinList.joinList.length <= 1) {
      console.log('ℹ️ 단일 그룹이므로 교차 오염 검사 불필요');
      return;
    }
    
    const targetGroup = currentJoinList.joinList.find(g => g.groupname === targetGroupName);
    if (!targetGroup) return;
    
    const targetChannelNames = (targetGroup.clubList || []).map(c => 
      typeof c === 'string' ? c : c.name
    );
    
    // 다른 그룹들의 채널과 비교
    const otherGroups = currentJoinList.joinList.filter(g => g.groupname !== targetGroupName);
    const contaminatedChannels: string[] = [];
    
    otherGroups.forEach(otherGroup => {
      const otherChannelNames = (otherGroup.clubList || []).map(c => 
        typeof c === 'string' ? c : c.name
      );
      
      // 채널명이 중복되는 경우 찾기
      const duplicates = targetChannelNames.filter(name => otherChannelNames.includes(name));
      contaminatedChannels.push(...duplicates);
    });
    
    if (contaminatedChannels.length > 0) {
      console.error('❌ 교차 그룹 채널 오염 감지:', {
        대상그룹: targetGroupName,
        오염된채널: contaminatedChannels
      });
      
      // 오염된 데이터 자동 정리 시도
      this.cleanupCrossGroupContamination(targetGroupName, contaminatedChannels);
    } else {
      console.log('✅ 교차 그룹 채널 오염 없음');
    }
  }

  private cleanupCrossGroupContamination(targetGroupName: string, contaminatedChannels: string[]): void {
    console.log('🧹 교차 그룹 채널 오염 정리 시작:', { targetGroupName, contaminatedChannels });
    
    const currentJoinList = this._userJoin();
    if (!currentJoinList) return;
    
    // 실제로는 서버 데이터를 다시 가져와서 정리하는 것이 안전
    console.warn('⚠️ 교차 오염 감지됨 - 서버 데이터 재동기화 권장');
    
    // 긴급 상황시 강제 새로고침 트리거
    setTimeout(() => {
      console.log('🔄 오염 정리를 위한 강제 새로고침 실행');
      this.forceRefreshUserJoin().catch(error => {
        console.error('❌ 강제 새로고침 실패:', error);
      });
    }, 1000);
  }

  addUserGroupSafely(groupId: number, groupName: string, clubs: Club[]): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('🔒 안전한 그룹 추가 시작:', { groupId, groupName, clubsCount: clubs.length });
      
      try {
        // 1. 현재 상태 백업
        const backupState = this._userJoin();
        
        // 2. 그룹 추가 시도
        this.addUserGroupWithChannels(groupId, groupName, clubs);
        
        // 3. 추가 후 검증
        const addedSuccessfully = this.verifyGroupAddition(groupName, clubs);
        
        if (addedSuccessfully) {
          console.log('✅ 안전한 그룹 추가 성공');
          resolve(true);
        } else {
          console.error('❌ 그룹 추가 검증 실패, 롤백 실행');
          this._userJoin.set(backupState);
          resolve(false);
        }
        
      } catch (error) {
        console.error('❌ 안전한 그룹 추가 실패:', error);
        resolve(false);
      }
    });
  }

  private verifyGroupAddition(groupName: string, expectedChannels: Club[]): boolean {
    console.log('🔍 그룹 추가 검증:', groupName);
    
    const currentJoinList = this._userJoin();
    if (!currentJoinList) {
      console.error('❌ UserJoin 데이터 없음');
      return false;
    }
    
    // 그룹이 존재하는지 확인
    const addedGroup = currentJoinList.joinList.find(g => g.groupname === groupName);
    if (!addedGroup) {
      console.error('❌ 그룹이 추가되지 않음:', groupName);
      return false;
    }
    
    // 채널이 올바르게 추가되었는지 확인
    const actualChannels = addedGroup.clubList || [];
    const expectedChannelNames = expectedChannels.map(c => c.name);
    
    const allChannelsPresent = expectedChannelNames.every(name =>
      actualChannels.some(c => (typeof c === 'string' ? c : c.name) === name)
    );
    
    if (!allChannelsPresent) {
      console.error('❌ 일부 채널이 누락됨');
      return false;
    }
    
    // 다른 그룹의 채널이 오염되지 않았는지 확인
    if (currentJoinList.joinList.length > 1) {
      const hasContamination = this.checkForChannelContamination(groupName);
      if (hasContamination) {
        console.error('❌ 채널 오염 감지됨');
        return false;
      }
    }
    
    console.log('✅ 그룹 추가 검증 통과');
    return true;
  }

  async emergencyCleanupUserJoin(): Promise<void> {
    console.log('🚨 UserJoin 데이터 응급 정리 시작...');
    
    try {
      // 1. 현재 상태 백업
      const backup = this._userJoin();
      
      // 2. 서버에서 최신 데이터 가져오기
      console.log('📡 서버에서 최신 데이터 가져오는 중...');
      const freshData = await this.loadUserJoin();
      
      if (freshData) {
        // 3. 새로운 데이터로 교체
        this._userJoin.set(freshData);
        
        // 4. 선택 상태 검증 및 정리
        this.validateAndCleanupSelections();
        
        console.log('✅ UserJoin 데이터 응급 정리 완료');
      } else {
        console.error('❌ 서버에서 데이터를 가져올 수 없음, 백업 데이터 유지');
        this._userJoin.set(backup);
      }
      
    } catch (error) {
      console.error('❌ UserJoin 데이터 응급 정리 실패:', error);
      
      // 최후의 수단: 빈 상태로 초기화
      this._userJoin.set({ id: '', joinList: [] });
      this.validateAndCleanupSelections();
    }
  }

  private checkForChannelContamination(targetGroupName: string): boolean {
    const currentJoinList = this._userJoin();
    if (!currentJoinList || currentJoinList.joinList.length <= 1) return false;
    
    const groups = currentJoinList.joinList;
    const channelGroups = new Map<string, string[]>(); // 채널명 -> 포함된 그룹들
    
    // 각 채널이 어떤 그룹들에 포함되어 있는지 매핑
    groups.forEach(group => {
      const channels = (group.clubList || []).map(c => 
        typeof c === 'string' ? c : c.name
      );
      
      channels.forEach(channelName => {
        if (!channelGroups.has(channelName)) {
          channelGroups.set(channelName, []);
        }
        channelGroups.get(channelName)!.push(group.groupname);
      });
    });
    
    // 하나의 채널이 여러 그룹에 속해있는지 확인
    for (const [channelName, groupNames] of channelGroups.entries()) {
      if (groupNames.length > 1) {
        console.error('❌ 채널 중복 오염:', { channelName, groups: groupNames });
        return true;
      }
    }
    
    return false;
  }

  /**
   * 그룹 제거 (탈퇴 시 사용)
   */
  removeUserGroup(groupName: string): void {
    const currentJoinList = this._userJoin();
    
    if (!currentJoinList) {
      console.error('Cannot remove group - no join list initialized');
      return;
    }

    const updatedJoinList: UserJoin = {
      ...currentJoinList,
      joinList: currentJoinList.joinList.filter(item => item.groupname !== groupName)
    };

    this._userJoin.set(updatedJoinList);
    
    // 확장된 섹션에서 제거
    this._expandedSections.update(sections => sections.filter(section => section !== groupName));
    
    // 현재 선택된 그룹이라면 선택 해제
    if (this.selectedGroup() === groupName) {
      this._selectedGroup.set(null);
      this._selectedChannel.set(null);
    }
  }

  /**
   * 특정 채널 제거 (채널 탈퇴 시 사용)
   */
  removeUserChannel(groupName: string, clubName: string): void {
    const currentJoinList = this._userJoin();
    
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
    
    targetGroup.clubList = targetGroup.clubList.filter(channel => channel.name !== clubName);
    updatedJoinList.joinList[groupIndex] = targetGroup;
    
    this._userJoin.set(updatedJoinList);
    
    // 현재 선택된 채널이라면 선택 해제
    if (this.selectedChannel() === clubName && this.selectedGroup() === groupName) {
      this._selectedChannel.set(null);
    }
  }

  // === 기존 메서드들 ===
  async refreshUserJoin(): Promise<void> {
    console.log('🔄 표준 사용자 가입 목록 새로고침');
    
    this.setLoadingState('userJoin', true);
    try {
      // 캐시 무효화
      this.userService['cacheService']?.removeCache('userJoin');
      
      const joinList = await this.loadUserJoin();
      if (joinList) {
        this._userJoin.set(joinList);
        this.validateCurrentSelections();
        console.log('✅ 표준 새로고침 완료');
      } else {
        this._userJoin.set({ id: '', joinList: [] });
      }
    } catch (error) {
      console.error('❌ 표준 새로고침 실패:', error);
      this.setError('가입 목록 새로고침에 실패했습니다.');
    } finally {
      this.setLoadingState('userJoin', false);
    }
  }

  emergencyReset(): void {
    console.log('🚨 긴급 상태 리셋 실행');
    
    // 선택 상태 모두 초기화
    this._selectedGroup.set(null);
    this._selectedChannel.set(null);
    this._selectedChannelInfo.set(null);
    this._expandedSections.set([]);
    
    // 사이드바 상태 초기화
    this._sidebarExpanded.set(false);
    
    // 에러 상태 클리어
    this.setError(null);
    
    console.log('✅ 긴급 상태 리셋 완료');
  }

  async safeForcedReinitialization(): Promise<void> {
    console.log('🔄 전체 애플리케이션 강제 재초기화 시작...');
    
    try {
      // 1. 모든 상태 초기화
      this.emergencyReset();
      
      // 2. 초기화 플래그 리셋
      this._initialized.set(false);
      
      // 3. 모든 캐시 클리어
      if (this.userService['cacheService']) {
        this.userService['cacheService'].removeCache('userStatus');
        this.userService['cacheService'].removeCache('userJoin');
        console.log('🗑️ 모든 캐시 클리어 완료');
      }
      
      // 4. 데이터 재로드
      await this.initializeUserData();
      
      console.log('✅ 전체 애플리케이션 강제 재초기화 완료');
      
    } catch (error) {
      console.error('❌ 강제 재초기화 실패:', error);
      this.setError('애플리케이션 재초기화에 실패했습니다.');
      throw error;
    }
  }

  async refreshUserStatus(): Promise<void> {
    this.setLoadingState('user', true);
    try {
      this.userService['cacheService']?.removeCache('userStatus');
      
      const user = await this.loadUserStatus();
      if (user) {
        this.setCurrentUser(user);
      }
    } catch (error) {
      console.error('Error refreshing user status:', error);
      this.setError('사용자 상태 새로고침에 실패했습니다.');
    } finally {
      this.setLoadingState('user', false);
    }
  }

  private validateCurrentSelections(): void {
    const joinList = this._userJoin();
    if (!joinList) return;

    const selectedGroup = this._selectedGroup();
    const selectedChannel = this._selectedChannel();

    if (selectedGroup) {
      const group = joinList.joinList.find(g => g.groupname === selectedGroup);
      if (!group) {
        this._selectedGroup.set(null);
        this._selectedChannel.set(null);
        return;
      }

      if (selectedChannel && !group.clubList.some(club => club.name === selectedChannel)) {
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
          this.setSelectedChannel(firstGroup.clubList[0].name, firstGroup.groupname);
        }
      }
    } else {
      this._sidebarExpanded.set(false);
    }
  }

  setSelectedGroup(groupId: string | null): void {
    if (!this.isValidGroup(groupId)) {
      console.warn('Invalid group ID:', groupId);
      return;
    }

    const previousGroup = this._selectedGroup();
    this._selectedGroup.set(groupId);
    this._selectedChannel.set(null);
    
    if (groupId && !this._expandedSections().includes(groupId)) {
      this._expandedSections.update(sections => {
        const sectionSet = new Set([...sections, groupId]);
        return Array.from(sectionSet);
      });
    }
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

  getGroupChannels(groupName: string): string[] {
    const joinList = this._userJoin();
    const group = joinList?.joinList.find(g => g.groupname === groupName);
    
    if (!group) return [];
    
    // Handle both string and Club object formats
    return group.clubList.map((club) => {
      if (typeof club === 'string') {
        return club;
      } else if (club && typeof club === 'object' && club.name) {
        return club.name;
      }
      return 'Unknown Channel';
    });
  }

  findGroupForChannel(clubName: string): string | null {
    const joinList = this._userJoin();
    if (!joinList) return null;

    for (const group of joinList.joinList) {
      const hasChannel = group.clubList.some(club => {
        if (typeof club === 'string') {
          return club === clubName;
        } else if (club && typeof club === 'object' && club.name) {
          return club.name === clubName;
        }
        return false;
      });
      
      if (hasChannel) {
        return group.groupname;
      }
    }
    return null;
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
      userJoin: false,
      groups: false,
      channels: false
    });
    this._sidebarExpanded.set(false);
    this._expandedSections.set([]);
    this._userJoin.set(null);
    this._initialized.set(false);
    this._error.set(null);
  }

  // 그룹 이름으로 그룹 ID 찾기
  private getGroupIdByName(groupName: string): number {
      const group = this._groupList().find(g => g.name === groupName);
      return group?.id || -1;
  }

  async forceRefreshUserJoin(): Promise<void> {
    console.log('🔄 강제 사용자 가입 목록 새로고침 시작...');
    
    this.setLoadingState('userJoin', true);
    this.setError(null);
    
    try {
      // 1. 캐시 완전 삭제
      if (this.userService['cacheService']) {
        this.userService['cacheService'].removeCache('userJoin');
        console.log('🗑️ UserJoin 캐시 삭제 완료');
      }
      
      // 2. 새로운 데이터 로드
      const freshJoinList = await this.loadUserJoin();
      
      if (freshJoinList) {
        // 3. 기존 상태와 비교하여 변경사항 로깅
        const previousGroupCount = this.userJoin()?.joinList?.length || 0;
        const newGroupCount = freshJoinList.joinList?.length || 0;
        
        console.log('📊 그룹 수 변화:', {
          이전: previousGroupCount,
          현재: newGroupCount,
          차이: newGroupCount - previousGroupCount
        });
        
        // 4. 새로운 데이터 설정
        this._userJoin.set(freshJoinList);
        
        // 5. 현재 선택 상태 유효성 검증 및 정리
        this.validateAndCleanupSelections();
        
        console.log('✅ 사용자 가입 목록 강제 새로고침 완료');
      } else {
        console.warn('⚠️ 새로고침 결과가 null - 빈 목록으로 설정');
        this._userJoin.set({ id: '', joinList: [] });
      }
      
    } catch (error) {
      console.error('❌ 강제 새로고침 실패:', error);
      this.setError('데이터 새로고침에 실패했습니다.');
      throw error;
    } finally {
      this.setLoadingState('userJoin', false);
    }
  }

  private validateAndCleanupSelections(): void {
    const currentGroup = this.selectedGroup();
    const currentChannel = this.selectedChannel();
    const availableGroups = this.availableGroups();
    
    let needsCleanup = false;
    
    // 현재 선택된 그룹이 가입 목록에 없는 경우
    if (currentGroup && !availableGroups.some(group => group.groupname === currentGroup)) {
      console.log('🧹 유효하지 않은 그룹 선택 정리:', currentGroup);
      this._selectedGroup.set(null);
      this._selectedChannel.set(null);
      this._selectedChannelInfo.set(null);
      needsCleanup = true;
    }
    
    // 현재 선택된 채널이 해당 그룹에 없는 경우
    if (currentChannel && currentGroup && !needsCleanup) {
      const group = availableGroups.find(g => g.groupname === currentGroup);
      const hasChannel = group?.clubList.some(club => {
        if (typeof club === 'string') {
          return club === currentChannel;
        } else if (club && typeof club === 'object' && club.name) {
          return club.name === currentChannel;
        }
        return false;
      });
      
      if (!hasChannel) {
        console.log('🧹 유효하지 않은 채널 선택 정리:', currentChannel);
        this._selectedChannel.set(null);
        this._selectedChannelInfo.set(null);
        needsCleanup = true;
      }
    }
    
    // 확장된 섹션 목록도 정리
    if (needsCleanup) {
      const validGroupNames = availableGroups.map(group => group.groupname);
      const currentExpanded = this.expandedSections();
      const validExpanded = currentExpanded.filter(sectionId => validGroupNames.includes(sectionId));
      
      if (validExpanded.length !== currentExpanded.length) {
        console.log('🧹 유효하지 않은 확장 섹션 정리');
        this._expandedSections.set(validExpanded);
      }
    }
    
    if (needsCleanup) {
      console.log('✅ 선택 상태 정리 완료');
    }
  }

  removeGroupImmediately(groupName: string): void {
    console.log('⚡ 즉시 그룹 제거:', groupName);
    
    const currentJoinList = this._userJoin();
    if (!currentJoinList) return;

    // 그룹 목록에서 제거
    const updatedJoinList = {
      ...currentJoinList,
      joinList: currentJoinList.joinList.filter(group => group.groupname !== groupName)
    };
    
    this._userJoin.set(updatedJoinList);
    
    // 해당 그룹이 현재 선택되어 있다면 선택 해제
    if (this.selectedGroup() === groupName) {
      this._selectedGroup.set(null);
      this._selectedChannel.set(null);
      this._selectedChannelInfo.set(null);
    }
    
    // 확장된 섹션에서도 제거
    this._expandedSections.update(sections => 
      sections.filter(sectionId => sectionId !== groupName)
    );
    
    console.log('✅ 즉시 그룹 제거 완료');
  }

  removeChannelImmediately(groupName: string, channelName: string): void {
    console.log('⚡ 즉시 채널 제거:', { groupName, channelName });
    
    const currentJoinList = this._userJoin();
    if (!currentJoinList) return;

    // 해당 그룹에서 채널 제거
    const updatedJoinList = {
      ...currentJoinList,
      joinList: currentJoinList.joinList.map(group => {
        if (group.groupname === groupName) {
          return {
            ...group,
            clubList: group.clubList.filter(club => {
              const clubName = typeof club === 'string' ? club : club.name;
              return clubName !== channelName;
            })
          };
        }
        return group;
      })
    };
    
    this._userJoin.set(updatedJoinList);
    
    // 해당 채널이 현재 선택되어 있다면 선택 해제
    if (this.selectedChannel() === channelName && this.selectedGroup() === groupName) {
      this._selectedChannel.set(null);
      this._selectedChannelInfo.set(null);
    }
    
    console.log('✅ 즉시 채널 제거 완료');
  }
}