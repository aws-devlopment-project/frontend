// GroupJoin.ts - 개선된 버전 (SharedService와 연동)
import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { Router } from "@angular/router";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { GroupService } from "../../../Core/Service/GroupService";
import { UserService } from "../../../Core/Service/UserService";
import { matchingGroup } from "../../../../environments/environtment";

interface GroupInfo {
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

  constructor(
    private router: Router,
    private shared: SharedStateService,
    private groupService: GroupService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.loadAvailableGroups();
    this.checkCurrentUserState();
  }

  private checkCurrentUserState(): void {
    // 현재 사용자의 가입 상태 확인
    const hasGroups = this.shared.hasGroups();
    const hasChannels = this.shared.hasChannels();
    
    console.log('Current user join status:', { hasGroups, hasChannels });
    
    // 이미 그룹과 채널이 모두 있는 경우 알림
    if (hasGroups && hasChannels) {
      console.log('User already has groups and channels');
      // 사용자가 의도적으로 추가 가입을 원할 수 있으므로 계속 진행
    }
  }

  private async loadAvailableGroups(): Promise<void> {
    try {
      let groups: string[] | null = await this.groupService.getGroupList();
      let viewGroups: GroupInfo[] = [];
      
      if (groups) {
        // 비동기 처리를 위해 Promise.all 사용
        const groupInfoPromises = groups.map(async (group: string, index: number) => {
          let info = await this.groupService.getGroupInfo(group);
          if (info) {
            return {
              name: info.name,
              description: info.description ? info.description : '',
              emoji: info.icon ? info.icon : '👥',
              memberCount: info.memberNum,
              activeToday: info.questSuccessNum ? Math.max(...info.questSuccessNum) : 0,
              tags: info.tag || []
            };
          } else {
            return {
              name: matchingGroup[index].name,
              description: matchingGroup[index].description,
              emoji: matchingGroup[index].emoji,
              memberCount: matchingGroup[index].memberCount,
              tags: matchingGroup[index].tags
            };
          }
        });
        viewGroups = await Promise.all(groupInfoPromises);
      } else {
        viewGroups = matchingGroup.map((group: any) => ({
          name: group.name,
          description: group.description,
          emoji: group.emoji,
          memberCount: group.memberCount,
          tags: group.tags
        }));
      }
      
      this.availableGroups.set(viewGroups);
    } catch (error) {
      console.error('Error loading available groups:', error);
      // 실패 시 기본 그룹 목록 사용
      const viewGroups = matchingGroup.map((group: any) => ({
        name: group.name,
        description: group.description,
        emoji: group.emoji,
        memberCount: group.memberCount,
        tags: group.tags
      }));
      this.availableGroups.set(viewGroups);
    }
  }

  selectGroup(group: GroupInfo): void {
    this.selectedGroup.set(group);
    this.loadChannelsForGroup(group.name);
  }

  private async loadChannelsForGroup(groupId: string): Promise<void> {
    try {
      // 그룹별 모임 데이터
      let groupInfo = await this.groupService.getGroupInfo(groupId);
      let exampleGroupInfo = matchingGroup.filter((group) => group.name === groupId);
      let clubData: ClubInfo[] = [];
      
      if (groupInfo && groupInfo.clubList) {
        clubData = groupInfo.clubList.map((club, index) => ({
          id: club.name, // 실제 클럽 이름을 ID로 사용
          name: club.name,
          icon: club.icon ? club.icon : exampleGroupInfo[0]?.emoji || '🏠',
          description: club.description ? club.description : exampleGroupInfo[0]?.description || '',
          members: club.memberNum || 0,
          activity: '활발'
        }));
      } else if (exampleGroupInfo[0]?.clubList?.length) {
        clubData = exampleGroupInfo[0].clubList.map((club, index) => ({
          id: club.name,
          name: club.name,
          icon: exampleGroupInfo[0].emoji,
          description: club.description || exampleGroupInfo[0].description,
          members: club.members ?? 0,
          activity: '활발'
        }));
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
  }

  toggleChannel(channelId: string): void {
    const current = this.selectedChannels();
    const updated = new Set(current);
    
    if (updated.has(channelId)) {
      updated.delete(channelId);
    } else {
      updated.add(channelId);
    }
    
    this.selectedChannels.set(updated);
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

    try {
      console.log('Starting group join process:', {
        userId: currentUser.id,
        groupName: group.name,
        selectedChannels: Array.from(selectedChannelIds)
      });

      // 1. UserService를 통해 그룹 참여
      const joinGroupSuccess = await this.userService.joinGroup(currentUser.id, group.name);
      if (!joinGroupSuccess) {
        throw new Error('그룹 참여에 실패했습니다.');
      }
      console.log('Successfully joined group:', group.name);

      // 2. UserService를 통해 채널 참여
      const joinClubSuccess = await this.userService.joinClub(
        currentUser.id, 
        group.name, 
        Array.from(selectedChannelIds)
      );
      if (!joinClubSuccess) {
        throw new Error('채널 참여에 실패했습니다.');
      }
      console.log('Successfully joined channels:', Array.from(selectedChannelIds));

      // 3. SharedStateService에 새로운 그룹과 채널 추가
      this.shared.addUserGroupWithChannels(group.name, Array.from(selectedChannelIds));
      console.log('Updated SharedStateService with new group and channels');

      // 4. 그룹 탭으로 전환하고 선택된 그룹/채널 설정
      this.shared.setActiveTab('group');
      this.shared.setSelectedGroup(group.name);
      
      // 첫 번째 선택된 채널을 자동 선택
      const firstSelectedChannel = Array.from(selectedChannelIds)[0];
      if (firstSelectedChannel) {
        this.shared.setSelectedChannel(firstSelectedChannel, group.name);
      }

      console.log('Group join process completed successfully:', {
        group: group.name,
        channels: Array.from(selectedChannelIds),
        activeTab: this.shared.activeTab(),
        selectedGroup: this.shared.selectedGroup(),
        selectedChannel: this.shared.selectedChannel()
      });

      // 5. 완료 단계로 이동
      this.updateStep(3);

    } catch (error) {
      console.error('그룹 참여 실패:', error);
      
      // 사용자에게 구체적인 오류 메시지 표시
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      alert(`그룹 참여에 실패했습니다: ${errorMessage}\n다시 시도해주세요.`);
      
      // 실패한 경우 SharedStateService 상태를 롤백할 수도 있음
      // 하지만 API 호출이 부분적으로 성공했을 수 있으므로 새로고침을 권장
      
    } finally {
      this.isLoading.set(false);
    }
  }

  goToDashboard(): void {
    console.log('Navigating to dashboard with current state:', {
      activeTab: this.shared.activeTab(),
      selectedGroup: this.shared.selectedGroup(),
      selectedChannel: this.shared.selectedChannel(),
      hasJoinedGroups: this.shared.hasJoinedGroups()
    });

    // 메인 페이지로 이동 (이미 그룹 탭으로 설정되어 있음)
    this.router.navigate(['/']);
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
    const channels = this.availableChannels();
    const selected = this.selectedChannels();
    
    return channels
      .filter(channel => selected.has(channel.id))
      .map(channel => channel.name);
  }

  // === 디버깅 및 상태 확인 메서드들 ===
  
  /**
   * 현재 상태를 콘솔에 출력 (디버깅 용도)
   */
  debugCurrentState(): void {
    console.log('=== GroupJoin Current State ===');
    console.log('Current Step:', this.currentStep());
    console.log('Selected Group:', this.selectedGroup());
    console.log('Selected Channels:', Array.from(this.selectedChannels()));
    console.log('Available Groups:', this.availableGroups().length);
    console.log('Available Channels:', this.availableChannels().length);
    console.log('Is Loading:', this.isLoading());
    console.log('SharedState Initialized:', this.shared.initialized());
    console.log('SharedState Has Joined Groups:', this.shared.hasJoinedGroups());
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

  /**
   * 컴포넌트 상태 리셋 (필요시 사용)
   */
  resetComponentState(): void {
    console.log('Resetting GroupJoin component state');
    this.currentStep.set(1);
    this.selectedGroup.set(null);
    this.selectedChannels.set(new Set());
    this.isLoading.set(false);
    this.availableChannels.set([]);
  }

  /**
   * SharedStateService와의 동기화 확인
   */
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
}