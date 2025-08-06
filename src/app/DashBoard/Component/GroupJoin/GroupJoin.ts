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
              description: info.description || '',
              emoji: info.icon || '👥',
              memberCount: info.memberNum,
              activeToday: info.questSuccessNum ? Math.max(...info.questSuccessNum) : 0,
              achievementRate: this.calculateAchievementRate(info.questSuccessNum, info.memberNum),
              rating: this.calculateRating(info.questSuccessNum),
              tags: info.tag || []
            };
          } else {
            return {
              name: matchingGroup[index]?.name || group,
              description: matchingGroup[index]?.description || '',
              emoji: matchingGroup[index]?.emoji || '👥',
              memberCount: matchingGroup[index]?.memberCount || 0,
              achievementRate: matchingGroup[index]?.achievementRate || 75,
              rating: matchingGroup[index]?.rating || 4.5,
              tags: matchingGroup[index]?.tags || []
            };
          }
        });
        
        viewGroups = await Promise.all(groupInfoPromises);
      } else {
        // 백업 데이터 사용
        viewGroups = matchingGroup.map((group: any) => ({
          name: group.name,
          description: group.description,
          emoji: group.emoji,
          memberCount: group.memberCount,
          achievementRate: group.achievementRate || 75,
          rating: group.rating || 4.5,
          tags: group.tags
        }));
      }
      
      this.availableGroups.set(viewGroups);
    } catch (error) {
      console.error('Error loading available groups:', error);
      // 에러 시 기본 데이터 사용
      this.availableGroups.set(matchingGroup);
    }
  }

  private calculateAchievementRate(questSuccessNum?: number[], memberNum?: number): number {
    if (!questSuccessNum || !memberNum || memberNum === 0) return 0;
    const totalSuccess = questSuccessNum.reduce((sum, num) => sum + num, 0);
    const totalPossible = questSuccessNum.length * memberNum;
    return Math.round((totalSuccess / totalPossible) * 100);
  }

  private calculateRating(questSuccessNum?: number[]): number {
    if (!questSuccessNum || questSuccessNum.length === 0) return 4.0;
    const avgSuccess = questSuccessNum.reduce((sum, num) => sum + num, 0) / questSuccessNum.length;
    return Math.min(5.0, Math.max(3.0, 3.0 + (avgSuccess / 10) * 2));
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
          id: club.name, // ID를 이름으로 사용
          name: club.name,
          icon: club.icon || exampleGroupInfo[0]?.emoji || '📢',
          description: club.description || `${club.name} 채널입니다.`,
          members: club.memberNum,
          activity: this.getActivityLevel(club.memberNum)
        }));
      } else {
        // 백업 데이터 사용
        if (exampleGroupInfo[0]?.clubList?.length) {
          clubData = exampleGroupInfo[0].clubList.map((club, index) => ({
            id: club.name,
            name: club.name,
            icon: exampleGroupInfo[0].emoji,
            description: exampleGroupInfo[0].description,
            members: club.members ?? 0,
            activity: this.getActivityLevel(club.members ?? 0)
          }));
        }
      }

      this.availableChannels.set(clubData);
    } catch (error) {
      console.error('Error loading channels for group:', error);
      this.availableChannels.set([]);
    }
  }

  private getActivityLevel(memberCount: number): string {
    if (memberCount > 50) return '매우 활발';
    if (memberCount > 20) return '활발';
    if (memberCount > 5) return '보통';
    return '조용함';
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
    const channels = this.selectedChannels();
    
    if (!group || channels.size === 0) return;

    this.isLoading.set(true);

    try {
      const userId = this.shared.currentUser()?.id;
      if (!userId) {
        throw new Error('User not logged in');
      }

      // 그룹 가입
      await this.userService.joinGroup(userId, group.name);
      console.log('Successfully joined group:', group.name);

      // 채널 가입
      const channelNames = Array.from(channels);
      await this.userService.joinClub(userId, group.name, channelNames);
      console.log('Successfully joined channels:', channelNames);

      // SharedService에 변경사항 알림
      await this.shared.onUserJoinedGroup(group.name);
      
      // 첫 번째 채널 선택
      if (channelNames.length > 0) {
        await this.shared.onUserJoinedChannel(group.name, channelNames[0]);
      }

      // 완료 단계로 이동
      this.updateStep(3);

      console.log('그룹 참여 완료:', {
        group: group.name,
        channels: channelNames
      });

    } catch (error) {
      console.error('그룹 참여 실패:', error);
      alert('그룹 참여에 실패했습니다. 다시 시도해주세요.');
    } finally {
      this.isLoading.set(false);
    }
  }

  goToDashboard(): void {
    // SharedStateService의 네비게이션 상태 확인
    const navState = this.shared.navigationState();
    
    if (navState.lastAttemptedTab && this.shared.canReturnToPreviousTab()) {
      // 이전에 시도했던 탭으로 돌아가기
      this.shared.returnToPreviousTab();
      this.router.navigate(['/board']);
    } else {
      // 기본적으로 그룹 탭으로 이동
      this.shared.setActiveTab('group');
      this.router.navigate(['/board']);
    }
  }

  // 뒤로가기 또는 취소 버튼 (선택사항)
  goBackToMain(): void {
    // 메인 애플리케이션으로 돌아가기
    this.router.navigate(['/board']);
  }

  // 단계별 뒤로가기/취소 버튼 텍스트
  getBackButtonText(): string {
    const userInfo = this.getCurrentUserInfo();
    
    if (userInfo.hasGroups && userInfo.hasChannels) {
      return '메인으로 돌아가기';
    } else {
      return '나중에 하기';
    }
  }

  // 완료 버튼 텍스트
  getCompletionButtonText(): string {
    const navState = this.shared.navigationState();
    
    if (navState.lastAttemptedTab === 'group') {
      return '그룹 채팅 시작하기';
    } else {
      return '대시보드로 이동';
    }
  }

  private updateStep(step: number): void {
    this.currentStep.set(step);
  }

  // 헬퍼 메서드들
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

  // 현재 사용자 상태 정보 (템플릿에서 사용 가능)
  getCurrentUserInfo() {
    return {
      hasGroups: this.shared.hasGroups(),
      hasChannels: this.shared.hasChannels(),
      availableGroups: this.shared.availableGroups(),
      canReturnToPrevious: this.shared.canReturnToPreviousTab()
    };
  }
}