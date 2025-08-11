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
  private _userJoin = signal<UserJoin | null>(null);
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
    
    console.log('Current channel resolved:', {
      clubId: club.id,
      clubName: club.name,
      groupId: club.groupId,
      groupName: selectedGroup
    });
    
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

      console.log('=== SharedStateService 초기화 시작 ===');

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
        console.log('✅ 사용자 정보 로드 완료');
      } else if (user.status === 'rejected') {
        console.error('❌ 사용자 정보 로드 실패:', user.reason);
        this.setError('사용자 정보를 불러올 수 없습니다.');
      }

      // 4. 가입 목록 처리
      if (joinList.status === 'fulfilled') {
        const joinListData = joinList.value || { id: '', joinList: [] };
        this._userJoin.set(joinListData);
        
        // 가입한 그룹이 있는 경우에만 기본 선택 설정
        if (joinListData.joinList.length > 0) {
          console.log('✅ 가입 목록 로드 완료:', joinListData.joinList.length, '개 그룹');
          this.processUserJoinList(joinListData);
          this.initializeDefaultSelections(joinListData);
        } else {
          console.log('ℹ️ 가입한 그룹이 없음 - 새 사용자');
        }
      } else if (joinList.status === 'rejected') {
        console.error('❌ 가입 목록 로드 실패:', joinList.reason);
        this._userJoin.set({ id: '', joinList: [] });
        console.log('빈 가입 목록으로 초기화');
      }

      this._initialized.set(true);
      console.log('✅ SharedStateService 초기화 완료', {
        hasUser: !!this.currentUser(),
        hasJoinedGroups: this.hasJoinedGroups(),
        totalGroups: this._groupList().length,
        totalClubs: this._clubList().length
      });

    } catch (error) {
      console.error('❌ SharedStateService 초기화 중 오류:', error);
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
      console.log('🔄 전체 그룹 목록 로드 중...');
      const groups = await this.groupService.getGroupList();
      console.log('✅ 그룹 목록 로드 완료:', groups.length, '개 그룹');
      return groups;
    } catch (error) {
      console.error('❌ 그룹 목록 로드 실패:', error);
      return [];
    }
  }

  // 새로 추가: 그룹 목록 처리
  private processGroupList(groups: Group[]): void {
    console.log('🔄 그룹 목록 처리 중...');
    
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

    console.log('✅ 그룹/클럽 목록 처리 완료:', {
      groups: groupList.length,
      clubs: clubList.length
    });

    // 디버깅용 로그
    console.log('그룹 목록:', groupList);
    console.log('클럽 목록:', clubList);
  }

  // 새로 추가: 사용자 가입 목록 처리
  private processUserJoinList(joinList: UserJoin): void {
    console.log('🔄 사용자 가입 목록 처리 중...');
    
    joinList.joinList.forEach(userGroup => {
      console.log(`처리 중인 그룹: ${userGroup.groupname}`, {
        groupId: userGroup.groupId,
        clubCount: userGroup.clubList.length,
        clubs: userGroup.clubList.map(c => c.name)
      });

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
      
      console.log(`📝 채널 변경 완료: ${previousChannel} → ${channelId}`, { 
          groupId, 
          channelName,
          channelInfo: this._selectedChannelInfo()
      });
  }

  setSelectedChannelByClubId(clubId: number, channelName?: string, groupName?: string): void {
      console.log('🎯 setSelectedChannelByClubId 호출:', { clubId, channelName, groupName });
      
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

      console.log('✅ clubId로 채널 설정 완료:', {
          clubId: club.id,
          clubName: club.name,
          groupId: group.id,
          groupName: group.name
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
      console.log('Group already exists in total list:', groupName);
      return;
    }

    const newGroupItem = { id: groupId, name: groupName };
    const updatedGroupList = [...this._groupList(), newGroupItem];
    this._groupList.set(updatedGroupList);
    console.log('✅ 그룹 추가됨:', newGroupItem);
  }

  addListClub(clubId: number, clubName: string, groupId: number) {
    const existingClubNames = new Set(this._clubList().map(club => club.name));
    if (existingClubNames.has(clubName)) {
      console.log('Club already exists in total list:', clubName);
      return;
    }

    const newClubItem = { id: clubId, name: clubName, groupId: groupId };
    const updatedClubList = [...this._clubList(), newClubItem];
    this._clubList.set(updatedClubList);
    console.log('✅ 클럽 추가됨:', newClubItem);
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
      'member': '관리'
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

  // === 새로 추가: 그룹/채널 동적 추가 메서드들 ===
  
  /**
   * 새로운 그룹을 사용자 가입 목록에 추가
   */
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

  /**
   * 그룹에 새로운 채널들을 추가
   */
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
    
    console.log('Channels added to group:', { groupName, newChannels, totalChannels: targetGroup.clubList.length });

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
    const clubsName = clubs.map((club: Club) => {
      return club.name;
    })
    console.log('Adding group with channels:', { groupName, clubsName });
    
    const currentJoinList = this._userJoin();
    
    if (!currentJoinList) {
      console.error('Cannot add group with channels - no join list initialized');
      return;
    }

    // Set을 사용하여 중복 체크
    const existingGroupNames = new Set(currentJoinList.joinList.map(item => item.groupname));
    
    if (existingGroupNames.has(groupName)) {
      // 기존 그룹에 채널만 추가 (중복 제거)
      console.log('Group exists, adding channels only:', groupName);
      this.addUserChannels(groupName, clubs);
    } else {
      // 새 그룹을 채널과 함께 추가 (채널 목록도 중복 제거)
      const uniqueChannels = Array.from(new Set(clubs));
      
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
      
      console.log('New group with channels added:', { 
        groupName, 
        uniqueChannels, 
        originalChannelCount: clubsName.length,
        finalChannelCount: uniqueChannels.length 
      });

      // 첫 번째 그룹이거나 그룹 탭에서 선택된 그룹이 없다면 자동 선택
      if ((currentJoinList.joinList.length === 0 || !this.selectedGroup()) && 
          this.activeTab() === 'group') {
        this.setSelectedGroup(groupName);
        if (uniqueChannels.length > 0) {
          this.setSelectedChannel(uniqueChannels[0].name, groupName);
        }
      }
    }
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
    
    console.log('Group removed from join list:', groupName);
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
    
    console.log('Channel removed from group:', { groupName, clubName });
  }

  // === 기존 메서드들 ===
  async refreshUserJoin(): Promise<void> {
    this.setLoadingState('userJoin', true);
    try {
      this.userService['cacheService']?.removeCache('userJoin');
      
      const joinList = await this.loadUserJoin();
      if (joinList) {
        this._userJoin.set(joinList);
        console.log('User join list refreshed successfully');
        this.validateCurrentSelections();
      } else {
        // API에서 빈 결과가 왔을 때 빈 목록으로 설정
        this._userJoin.set({ id: '', joinList: [] });
        console.log('User join list refreshed with empty result');
      }
    } catch (error) {
      console.error('Error refreshing user join list:', error);
      this.setError('가입 목록 새로고침에 실패했습니다.');
    } finally {
      this.setLoadingState('userJoin', false);
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
    const joinList = this._userJoin();
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

      if (selectedChannel && !group.clubList.some(club => club.name === selectedChannel)) {
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
          this.setSelectedChannel(firstGroup.clubList[0].name, firstGroup.groupname);
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
    
    if (groupId && !this._expandedSections().includes(groupId)) {
      this._expandedSections.update(sections => {
        const sectionSet = new Set([...sections, groupId]);
        return Array.from(sectionSet);
      });
    }
    
    console.log(`Group changed: ${previousGroup} → ${groupId}`);
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
    console.log('SharedStateService reset completed');
  }

  // 그룹 이름으로 그룹 ID 찾기
  private getGroupIdByName(groupName: string): number {
      const group = this._groupList().find(g => g.name === groupName);
      return group?.id || -1;
  }
}