// GroupJoin.ts - 데이터 동기화 문제 해결
import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { Router } from "@angular/router";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { GroupService } from "../../../Core/Service/GroupService";
import { UserService } from "../../../Core/Service/UserService";
import { Group } from "../../../Core/Models/group";

interface GroupInfo {
  id: number;
  name: string;
  description: string;
  emoji: string;
  memberCount: number;
  activeToday?: number;
  achievementRate?: number;
  rating?: number;
  tags: string[];
}

interface ClubInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  members: number;
  activity?: string;
  clubId?: number; // 실제 DB의 clubId 추가
}

@Component({
  selector: 'app-group-join',
  templateUrl: './GroupJoin.html',
  styleUrl: './GroupJoin.css',
  imports: [CommonModule, MatIconModule],
  standalone: true
})
export class GroupJoinComponent implements OnInit {
  // 상태 관리
  currentStep = signal<number>(1);
  selectedGroup = signal<GroupInfo | null>(null);
  selectedChannels = signal<Set<string>>(new Set());
  isLoading = signal<boolean>(false);

  // 데이터
  availableGroups = signal<GroupInfo[]>([]);
  availableChannels = signal<ClubInfo[]>([]);

  // 실제 선택된 채널의 상세 정보 (DB 정보 포함)
  private selectedChannelDetails = signal<ClubInfo[]>([]);

  constructor(
    private router: Router,
    private shared: SharedStateService,
    private groupService: GroupService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.loadAvailableGroups();
  }

  private async loadAvailableGroups(): Promise<void> {
    try {
      console.log('📊 사용 가능한 그룹 목록 로드 시작...');
      
      let groups: Group[] | [] = await this.groupService.getGroupList();
      let viewGroups: GroupInfo[] | null = [];
      
      if (groups) {
        console.log(`📊 서버에서 ${groups.length}개 그룹 로드됨`);
        
        // 각 그룹 정보를 처리하고 SharedState에 등록
        groups.forEach((info: Group) => {
          if (info) {
            viewGroups?.push({
              id: info.id,
              name: info.name,
              description: info.description ? info.description : '',
              emoji: info.icon ? info.icon : '👥',
              memberCount: info.memberNum,
              activeToday: info.questSuccessNum ? Math.max(...info.questSuccessNum) : 0,
              tags: info.tag || []
            });
            
            // SharedState에 그룹 정보 등록
            this.shared.addListGroup(info.id, info.name);
            
            // 각 그룹의 클럽 정보도 미리 등록
            if (info.clubList && info.clubList.length > 0) {
              info.clubList.forEach(club => {
                this.shared.addListClub(club.clubId, club.name, info.id);
              });
            }
          } else {
            console.error('[group]: groupList load fail to Server');
          }
        });
        
        console.log('✅ 그룹 정보 SharedState 등록 완료');
      } else {
        viewGroups = null;
      }
      
      if (!viewGroups || viewGroups.length === 0) {
        this.router.navigate(['/']);
      } else {
        this.availableGroups.set(viewGroups);
      }
    } catch (error) {
      console.error('Error loading available groups:', error);
    }
  }

  selectGroup(group: GroupInfo): void {
    console.log('🎯 그룹 선택:', group.name);
    this.selectedGroup.set(group);
    this.selectedChannels.set(new Set()); // 채널 선택 초기화
    this.selectedChannelDetails.set([]); // 채널 상세 정보 초기화
    this.loadClubsForGroup(group.name);
  }

  private async loadClubsForGroup(groupId: string): Promise<void> {
    try {
      console.log('🏢 그룹별 클럽 정보 로드:', groupId);
      
      // 그룹별 모임 데이터
      let groupInfo = await this.groupService.getGroupInfo(groupId);
      let clubData: ClubInfo[] = [];
      
      if (groupInfo && groupInfo.clubList) {
        console.log(`📋 ${groupInfo.clubList.length}개 클럽 발견`);
        
        clubData = groupInfo.clubList.map((club) => ({
          id: club.name, // 클럽 이름을 ID로 사용
          name: club.name,
          icon: club.icon ? club.icon : '🏠',
          description: club.description ? club.description : '',
          members: club.memberNum || 0,
          activity: '활발',
          clubId: club.clubId // 실제 DB의 clubId 저장
        }));

        console.log('✅ 클럽 데이터 처리 완료:', clubData.map(c => `${c.name}(ID:${c.clubId})`));
      }
      
      this.availableChannels.set(clubData);
    } catch (error) {
      console.error('Error loading channels for group:', groupId, error);
      this.availableChannels.set([]);
    }
  }

  goToChannelSelection(): void {
    if (!this.selectedGroup()) return;
    this.updateStep(2);
  }

  goBackToGroups(): void {
    this.updateStep(1);
    this.selectedChannels.set(new Set());
    this.selectedChannelDetails.set([]);
  }

  toggleChannel(channelId: string): void {
    const current = this.selectedChannels();
    const updated = new Set(current);
    const channelDetails = this.selectedChannelDetails();
    
    if (updated.has(channelId)) {
      // 채널 선택 해제
      updated.delete(channelId);
      const updatedDetails = channelDetails.filter(detail => detail.id !== channelId);
      this.selectedChannelDetails.set(updatedDetails);
    } else {
      // 채널 선택 추가
      updated.add(channelId);
      const channelInfo = this.availableChannels().find(ch => ch.id === channelId);
      if (channelInfo) {
        const updatedDetails = [...channelDetails, channelInfo];
        this.selectedChannelDetails.set(updatedDetails);
      }
    }
    
    this.selectedChannels.set(updated);
    
    console.log('🎯 채널 선택 상태 업데이트:', {
      선택된채널: Array.from(updated),
      상세정보: this.selectedChannelDetails().map(d => `${d.name}(ID:${d.clubId})`)
    });
  }

  isChannelSelected(channelId: string): boolean {
    return this.selectedChannels().has(channelId);
  }

  hasSelectedChannels(): boolean {
    return this.selectedChannels().size > 0;
  }

  async joinSelectedGroup(): Promise<void> {
    const group = this.selectedGroup();
    const selectedChannelIds = this.selectedChannels();
    const channelDetails = this.selectedChannelDetails();
    
    if (!group || selectedChannelIds.size === 0) {
      console.error('No group or channels selected');
      return;
    }

    // 현재 사용자 정보 확인
    const currentUser = this.shared.currentUser();
    if (!currentUser) {
      console.error('No current user found');
      alert('사용자 정보를 찾을 수 없습니다.');
      return;
    }

    this.isLoading.set(true);
    console.log('🚀 그룹 참여 프로세스 시작:', {
      그룹: group.name,
      채널수: selectedChannelIds.size,
      선택된채널: Array.from(selectedChannelIds)
    });

    try {
      // 1. UserService를 통해 그룹 참여
      console.log('📝 1단계: 그룹 참여 API 호출...');
      const joinGroupSuccess = await this.userService.joinGroup(currentUser.id, group.id, group.name);
      if (!joinGroupSuccess) {
        throw new Error('그룹 참여에 실패했습니다.');
      }
      console.log('✅ 그룹 참여 API 성공');

      // 2. UserService를 통해 채널 참여
      console.log('📝 2단계: 채널 참여 API 호출...');
      const joinClubSuccess = await this.userService.joinClub(
        currentUser.id, 
        group.name, 
        Array.from(selectedChannelIds)
      );
      if (!joinClubSuccess) {
        throw new Error('채널 참여에 실패했습니다.');
      }
      console.log('✅ 채널 참여 API 성공');

      // 3. SharedStateService에 안전하게 데이터 추가
      console.log('📝 3단계: SharedState 안전 업데이트...');
      const sharedStateSuccess = await this.updateSharedStateSafely(group, channelDetails);
      
      if (!sharedStateSuccess) {
        throw new Error('SharedState 업데이트에 실패했습니다.');
      }

      // 4. 신규 채널 참여 시 퀘스트 업데이트에 대한 캐시 비우기
      this.userService.clearUserQuestCache();

      // 5. SharedState 강제 새로고침으로 최신 데이터 보장
      console.log('📝 4단계: SharedState 강제 새로고침...');
      await this.shared.forceRefreshUserJoin();
      
      // 6. 최종 검증
      console.log('📝 5단계: 최종 데이터 검증...');
      const finalValidation = this.validateFinalState(group, channelDetails);
      if (!finalValidation.isValid) {
        console.warn('⚠️ 최종 검증에서 문제 발견:', finalValidation.issues);
        // 문제가 있어도 진행 (서버 상태는 정상이므로)
      }

      // 7. 그룹 탭으로 전환하고 선택된 그룹/채널 설정
      console.log('📝 6단계: 탭 전환 및 선택 상태 설정...');
      this.shared.setActiveTab('group');
      this.shared.setSelectedGroup(group.name);
      
      // 첫 번째 선택된 채널을 자동 선택
      const firstSelectedChannel = Array.from(selectedChannelIds)[0];
      if (firstSelectedChannel) {
        this.shared.setSelectedChannel(firstSelectedChannel, group.name);
      }

      // 8. 완료 단계로 이동
      this.updateStep(3);
      console.log('🎉 그룹 참여 프로세스 완료!');

    } catch (error) {
      console.error('❌ 그룹 참여 실패:', error);
      
      // 사용자에게 구체적인 오류 메시지 표시
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      alert(`그룹 참여에 실패했습니다: ${errorMessage}\n다시 시도해주세요.`);
      
      // 실패한 경우 SharedState 정리 (부분적으로 성공했을 가능성 대비)
      await this.cleanupFailedJoin(group);
      
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * SharedState를 안전하게 업데이트
   */
  private async updateSharedStateSafely(group: GroupInfo, channelDetails: ClubInfo[]): Promise<boolean> {
    try {
      console.log('🔒 SharedState 안전 업데이트 시작...');
      
      // Club 객체 형태로 변환 (SharedState가 기대하는 형태)
      const clubList = channelDetails.map(channel => ({
        clubId: channel.clubId || -1, // 실제 DB의 clubId 사용
        name: channel.name,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      console.log('📋 변환된 클럽 목록:', clubList.map(c => `${c.name}(ID:${c.clubId})`));

      // SharedState의 안전한 그룹 추가 메서드 사용
      const success = await this.shared.addUserGroupSafely(group.id, group.name, clubList);
      
      if (success) {
        console.log('✅ SharedState 안전 업데이트 성공');
        
        // 업데이트 후 상태 검증
        this.validateSharedStateUpdate(group.name, channelDetails);
        return true;
      } else {
        console.error('❌ SharedState 안전 업데이트 실패');
        return false;
      }
      
    } catch (error) {
      console.error('❌ SharedState 안전 업데이트 중 오류:', error);
      return false;
    }
  }

  /**
   * 최종 상태 검증
   */
  private validateFinalState(group: GroupInfo, channelDetails: ClubInfo[]): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    console.log('🔍 최종 상태 검증 시작...');
    
    try {
      // 1. SharedState에서 그룹 확인
      const availableGroups = this.shared.availableGroups();
      const addedGroup = availableGroups.find(g => g.groupname === group.name);
      
      if (!addedGroup) {
        issues.push('그룹이 SharedState에 없음');
      } else {
        // 2. 채널 확인
        const actualChannels = addedGroup.clubList || [];
        const expectedChannelNames = channelDetails.map(ch => ch.name);
        
        const missingChannels = expectedChannelNames.filter(name =>
          !actualChannels.some(ch => (typeof ch === 'string' ? ch : ch.name) === name)
        );
        
        if (missingChannels.length > 0) {
          issues.push(`누락된 채널: ${missingChannels.join(', ')}`);
        }
        
        // 3. 다른 그룹 오염 확인
        const otherGroups = availableGroups.filter(g => g.groupname !== group.name);
        const contaminatedChannels: string[] = [];
        
        otherGroups.forEach(otherGroup => {
          const otherChannelNames = (otherGroup.clubList || []).map(ch =>
            typeof ch === 'string' ? ch : ch.name
          );
          
          expectedChannelNames.forEach(channelName => {
            if (otherChannelNames.includes(channelName)) {
              contaminatedChannels.push(`${channelName} -> ${otherGroup.groupname}`);
            }
          });
        });
        
        if (contaminatedChannels.length > 0) {
          issues.push(`다른 그룹에 오염된 채널: ${contaminatedChannels.join(', ')}`);
        }
      }
      
      // 4. 선택 상태 확인
      const selectedGroup = this.shared.selectedGroup();
      const selectedChannel = this.shared.selectedChannel();
      
      if (selectedGroup !== group.name) {
        issues.push(`선택된 그룹 불일치: 기대값=${group.name}, 실제값=${selectedGroup}`);
      }
      
      if (channelDetails.length > 0) {
        const firstChannelName = channelDetails[0].name;
        if (selectedChannel !== firstChannelName) {
          issues.push(`선택된 채널 불일치: 기대값=${firstChannelName}, 실제값=${selectedChannel}`);
        }
      }
      
    } catch (error) {
      issues.push(`검증 중 오류: ${error}`);
    }
    
    const isValid = issues.length === 0;
    
    console.log('🔍 최종 상태 검증 결과:', {
      유효: isValid,
      문제수: issues.length,
      문제목록: issues
    });
    
    return { isValid, issues };
  }

  /**
   * SharedState 업데이트 후 검증
   */
  private validateSharedStateUpdate(groupName: string, expectedChannels: ClubInfo[]): void {
    console.log('🔍 SharedState 업데이트 검증 시작...');
    
    const availableGroups = this.shared.availableGroups();
    const addedGroup = availableGroups.find(g => g.groupname === groupName);
    
    if (!addedGroup) {
      console.error('❌ 그룹이 SharedState에 추가되지 않음:', groupName);
      return;
    }
    
    console.log('✅ 그룹이 SharedState에 정상 추가됨:', groupName);
    
    const actualChannels = addedGroup.clubList || [];
    const expectedChannelNames = expectedChannels.map(ch => ch.name);
    
    console.log('📊 채널 비교:', {
      기대값: expectedChannelNames,
      실제값: actualChannels.map(ch => typeof ch === 'string' ? ch : ch.name)
    });
    
    const allChannelsAdded = expectedChannelNames.every(name => 
      actualChannels.some(ch => (typeof ch === 'string' ? ch : ch.name) === name)
    );
    
    if (allChannelsAdded) {
      console.log('✅ 모든 채널이 SharedState에 정상 추가됨');
    } else {
      console.warn('⚠️ 일부 채널이 SharedState에 누락됨');
    }
  }

  /**
   * 실패한 참여 시도 후 정리 작업
   */
  private async cleanupFailedJoin(group: GroupInfo): Promise<void> {
    try {
      console.log('🧹 실패한 참여 시도 정리 시작...');
      
      // SharedState에서 부분적으로 추가된 데이터 제거
      this.shared.removeUserGroup(group.name);
      
      // 강제 새로고침으로 서버 상태와 동기화
      await this.shared.forceRefreshUserJoin();
      
      console.log('✅ 정리 작업 완료');
      
    } catch (error) {
      console.error('❌ 정리 작업 실패:', error);
    }
  }

  goToDashboard(): void {
    // 메인 페이지로 이동 (이미 그룹 탭으로 설정되어 있음)
    this.router.navigate(['/board']);
  }

  private updateStep(step: number): void {
    this.currentStep.set(step);
  }

  // === 헬퍼 메서드들 ===
  isStep(step: number): boolean {
    return this.currentStep() === step;
  }

  isStepCompleted(step: number): boolean {
    return this.currentStep() > step;
  }

  isStepActive(step: number): boolean {
    return this.currentStep() === step;
  }

  getSelectedChannelNames(): string[] {
    const channelDetails = this.selectedChannelDetails();
    return channelDetails.map(channel => channel.name);
  }

  debugCurrentState(): void {
    console.log('=== GroupJoin Current State ===');
    console.log('Current Step:', this.currentStep());
    console.log('Selected Group:', this.selectedGroup());
    console.log('Selected Channels:', Array.from(this.selectedChannels()));
    console.log('Selected Channel Details:', this.selectedChannelDetails());
    console.log('Available Groups:', this.availableGroups().length);
    console.log('Available Channels:', this.availableChannels().length);
    console.log('Is Loading:', this.isLoading());
    console.log('SharedState Initialized:', this.shared.initialized());
    console.log('SharedState Has Joined Groups:', this.shared.hasJoinedGroups());
    console.log('SharedState Available Groups:', this.shared.availableGroups());
    console.log('SharedState Current User:', this.shared.currentUser());
    console.log('================================');
  }

  /**
   * 선택된 채널이 유효한지 확인
   */
  private validateSelectedChannels(): boolean {
    const selectedChannelIds = this.selectedChannels();
    const availableChannels = this.availableChannels();
    const availableChannelIds = new Set(availableChannels.map(ch => ch.id));
    
    for (const channelId of selectedChannelIds) {
      if (!availableChannelIds.has(channelId)) {
        console.warn('Invalid channel selected:', channelId);
        return false;
      }
    }
    
    return true;
  }

  resetComponentState(): void {
    this.currentStep.set(1);
    this.selectedGroup.set(null);
    this.selectedChannels.set(new Set());
    this.selectedChannelDetails.set([]);
    this.isLoading.set(false);
    this.availableChannels.set([]);
  }

  checkSharedStateSync(): boolean {
    const sharedGroups = this.shared.availableGroups();
    const selectedGroup = this.selectedGroup();
    
    if (selectedGroup) {
      const isGroupInSharedState = sharedGroups.some(g => g.groupname === selectedGroup.name);
      if (!isGroupInSharedState) {
        console.warn('Selected group not found in SharedState:', selectedGroup.name);
        return false;
      }
    }
    
    return true;
  }

  /**
   * 긴급 상황시 전체 상태 재설정
   */
  async emergencyReset(): Promise<void> {
    console.log('🚨 긴급 상태 재설정 실행');
    
    try {
      // 컴포넌트 상태 초기화
      this.resetComponentState();
      
      // SharedState 강제 재초기화
      await this.shared.safeForcedReinitialization();
      
      // 그룹 목록 다시 로드
      await this.loadAvailableGroups();
      
      console.log('✅ 긴급 재설정 완료');
      
    } catch (error) {
      console.error('❌ 긴급 재설정 실패:', error);
      alert('시스템 재설정에 실패했습니다. 페이지를 새로고침해주세요.');
    }
  }
}