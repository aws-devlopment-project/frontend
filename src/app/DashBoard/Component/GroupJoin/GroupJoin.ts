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
  }

  private async loadAvailableGroups(): Promise<void> {
    const groups: string[] | null = await this.groupService.getGroupList();
    let viewGroups: GroupInfo[] = [];
    if (groups) {
      groups.forEach(async (group: string, index: number) => {
        let info = await this.groupService.getGroupInfo(group);
        console.log(info);
        if (info) {
          viewGroups.push({
            name: info.name,
            description: info.description ? info.description : '',
            emoji: info.icon? info.icon : '👥',
            memberCount: info.memberNum,
            tags: info.tag
          });
        } else {
          viewGroups.push({
            name: matchingGroup[index].name,
            description: matchingGroup[index].description,
            emoji: matchingGroup[index].emoji,
            memberCount: matchingGroup[index].memberCount,
            tags: matchingGroup[index].tags
          });
        }
      })
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
  }

  selectGroup(group: GroupInfo): void {
    this.selectedGroup.set(group);
    this.loadChannelsForGroup(group.name);
  }

  private async loadChannelsForGroup(groupId: string): Promise<void> {
    // 그룹별 모임 데이터
    let groupInfo = await this.groupService.getGroupInfo(groupId);
    let exampleGroupInfo = matchingGroup.filter((group) => group.name === groupId);
    let clubData: ClubInfo[] = [];
    if (groupInfo) {
      clubData = groupInfo.clubList.map((club, index) => ({
        id: index.toString(),
        name: club.name,
        icon: club.icon ? club.icon : exampleGroupInfo[0].emoji,
        description: club.description ? club.description : exampleGroupInfo[0].description,
        members: club.memberNum,
        activity: '활발'
      }))}
    else {
      if (exampleGroupInfo[0].clubList?.length) {
        clubData = exampleGroupInfo[0].clubList.map((club, index) => ({
          id: index.toString(),
          name: club.name,
          icon: exampleGroupInfo[0].emoji,
          description: exampleGroupInfo[0].description,
          members: club.members ?? 0,
          activity: '활발'
        }))} 
    }

    this.availableChannels.set(clubData);
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
      // 실제 구현에서는 API 호출로 그룹 참여 처리
      await this.userService.joinGroup(this.shared.currentUser()?.id, group.name);
      await this.userService.joinClub(this.shared.currentUser()?.id, group.name, Array.from(channels));

      // SharedService에 선택된 그룹과 첫 번째 채널 설정
      this.shared.setSelectedGroup(group.name);
      const firstChannel = Array.from(channels)[0];
      this.shared.setSelectedChannel(firstChannel, group.name);
      // 완료 단계로 이동
      this.updateStep(3);

      console.log('그룹 참여 완료:', {
        group: group.name,
        channels: Array.from(channels)
      });

    } catch (error) {
      console.error('그룹 참여 실패:', error);
      alert('그룹 참여에 실패했습니다. 다시 시도해주세요.');
    } finally {
      this.isLoading.set(false);
    }
  }

  goToDashboard(): void {
    // 그룹 대시보드로 이동
    this.router.navigate(['/group/dashboard']);
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
}