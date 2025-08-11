// GroupJoin.ts - 개선된 버전 (SharedService와 연동)
import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { Router } from "@angular/router";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { GroupService } from "../../../Core/Service/GroupService";
import { UserService } from "../../../Core/Service/UserService";
import { matchingGroup } from "../../../../environments/environtment";
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
  }

  private async loadAvailableGroups(): Promise<void> {
    try {
      let groups: Group[] | [] = await this.groupService.getGroupList();
      let viewGroups: GroupInfo[] | null = [];
      
      if (groups) {
        // 비동기 처리를 위해 Promise.all 사용
        const groupInfoPromises: GroupInfo[] = [];
        groups.forEach((info: Group) => {
          if (info) {
            groupInfoPromises.push({
              id: info.id,
              name: info.name,
              description: info.description ? info.description : '',
              emoji: info.icon ? info.icon : '👥',
              memberCount: info.memberNum,
              activeToday: info.questSuccessNum ? Math.max(...info.questSuccessNum) : 0,
              tags: info.tag || []
            });
            this.shared.addListGroup(info.id, info.name);
          } else {
            console.error('[group]: groupList load fail to Server');
          }
        });
        viewGroups = await Promise.all(groupInfoPromises);
      } else {
        viewGroups = null;
      }
      
      if (!viewGroups || viewGroups.length === 0) {
          this.router.navigate(['/'])
      } else
        this.availableGroups.set(viewGroups);
    } catch (error) {
      console.error('Error loading available groups:', error);
    }
  }

  selectGroup(group: GroupInfo): void {
    this.selectedGroup.set(group);
    this.loadClubsForGroup(group.name);
  }

  private async loadClubsForGroup(groupId: string): Promise<void> {
    try {
      // 그룹별 모임 데이터
      let groupInfo = await this.groupService.getGroupInfo(groupId);
      let exampleGroupInfo = matchingGroup.filter((group) => group.name === groupId);
      let clubData: ClubInfo[] = [];
      
      if (groupInfo && groupInfo.clubList) {
        groupInfo.clubList.forEach((club) => {
          const data: ClubInfo = {
            id: club.name,
            name: club.name,
            icon: club.icon ? club.icon : '🏠',
            description: club.description ? club.description : '',
            members: club.memberNum || 0,
            activity: '활발'
          };
          clubData.push(data);
          this.shared.addListClub(club.clubId, club.name, groupInfo.id);
        })
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
      const groupSet = this.shared.groupList().filter((g) => g.id === group.id);
      // 1. UserService를 통해 그룹 참여
      const joinGroupSuccess = await this.userService.joinGroup(currentUser.id, group.id, group.name);
      if (!joinGroupSuccess) {
        throw new Error('그룹 참여에 실패했습니다.');
      }

      // 2. UserService를 통해 채널 참여
      const joinClubSuccess = await this.userService.joinClub(
        currentUser.id, 
        group.name, 
        Array.from(selectedChannelIds)
      );
      if (!joinClubSuccess) {
        throw new Error('채널 참여에 실패했습니다.');
      }

      // 3. SharedStateService에 새로운 그룹과 채널 추가
      const clubList = this.shared.clubList().filter((club) => club.groupId === group.id).map((club) => ({
        clubId: club.id,
        name: club.name,
        createdAt: new Date(),
        updatedAt: new Date()
      }));
      this.shared.addUserGroupWithChannels(group.id, group.name, clubList);

      // 4. 그룹 탭으로 전환하고 선택된 그룹/채널 설정
      this.shared.setActiveTab('group');
      this.shared.setSelectedGroup(group.name);
      
      // 첫 번째 선택된 채널을 자동 선택
      const firstSelectedChannel = Array.from(selectedChannelIds)[0];
      if (firstSelectedChannel) {
        this.shared.setSelectedChannel(firstSelectedChannel, group.name);
      }

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
    const channels = this.availableChannels();
    const selected = this.selectedChannels();
    
    return channels
      .filter(channel => selected.has(channel.id))
      .map(channel => channel.name);
  }

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

  resetComponentState(): void {
    this.currentStep.set(1);
    this.selectedGroup.set(null);
    this.selectedChannels.set(new Set());
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
}