import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { Router } from "@angular/router";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { GroupService } from "../../../Core/Service/GroupService";

interface GroupInfo {
  name: string;
  description: string;
  emoji: string;
  memberCount: number;
  activeToday: number;
  achievementRate: number;
  rating: number;
  tags: string[];
}

interface ChannelInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  members: number;
  activity: string;
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
  availableChannels = signal<ChannelInfo[]>([]);

  constructor(
    private router: Router,
    private shared: SharedStateService,
    private groupService: GroupService
  ) {}

  ngOnInit(): void {
    this.loadAvailableGroups();
  }

  private loadAvailableGroups(): void {
    const groups = this.groupService.getGroupList();
    const viewGroups: GroupInfo[] = [
      {
        name: '0원 챌린지',
        description: '돈 쓰지 않고도 건강하고 의미있는 생활을 만들어가는 챌린지. 매일 새로운 무료 활동으로 갓생을 살아보세요!',
        emoji: '💪',
        memberCount: 124,
        activeToday: 84,
        achievementRate: 78,
        rating: 4.8,
        tags: ['절약', '건강', '생활습관', '무료활동']
      },
      {
        name: 'J처럼 살기',
        description: '계획적이고 체계적인 라이프스타일을 추구하는 사람들의 모임. MBTI J 성향이 강한 분들과 함께 효율적인 삶을 만들어요.',
        emoji: '🌟',
        memberCount: 67,
        activeToday: 43,
        achievementRate: 85,
        rating: 4.9,
        tags: ['계획', '체계', 'MBTI', '라이프스타일']
      },
      {
        name: '작심삼일 탈출',
        description: '작심삼일을 극복하고 꾸준한 자기계발을 실현하는 그룹. 습관 형성과 목표 달성을 함께 응원해요.',
        emoji: '📚',
        memberCount: 89,
        activeToday: 56,
        achievementRate: 72,
        rating: 4.7,
        tags: ['습관형성', '자기계발', '동기부여', '꾸준함']
      }
    ];

    this.availableGroups.set(viewGroups);
  }

  selectGroup(group: GroupInfo): void {
    this.selectedGroup.set(group);
    this.loadChannelsForGroup(group.name);
  }

  private loadChannelsForGroup(groupId: string): void {
    // 그룹별 채널 데이터
    const channelData: { [key: string]: ChannelInfo[] } = {
      challenge: [
        {
          id: 'general',
          name: '일반',
          icon: '💬',
          description: '0원으로 갓생을 살아가는 모든 이야기를 나눠요',
          members: 124,
          activity: '매우 활발'
        },
        {
          id: 'quest',
          name: '일일 퀘스트',
          icon: '🎯',
          description: '매일 새로운 도전과 퀘스트를 함께해요',
          members: 98,
          activity: '활발'
        },
        {
          id: 'tips',
          name: '팁 공유',
          icon: '💡',
          description: '돈 안 쓰고 살기 좋은 팁들을 공유해요',
          members: 87,
          activity: '보통'
        }
      ],
      lifestyle: [
        {
          id: 'entj',
          name: 'ENTJ 모여라!',
          icon: '👑',
          description: 'ENTJ들의 계획적이고 효율적인 라이프스타일 공유',
          members: 23,
          activity: '활발'
        },
        {
          id: 'estp',
          name: 'ESTP 모여라!',
          icon: '⚡',
          description: 'ESTP들의 활동적이고 역동적인 삶의 이야기',
          members: 19,
          activity: '보통'
        },
        {
          id: 'samyang',
          name: '삼양 모여라!',
          icon: '🏢',
          description: '삼양인들의 특별한 라이프스타일과 경험 공유',
          members: 25,
          activity: '활발'
        }
      ],
      resolution: [
        {
          id: 'workout',
          name: '운동하기',
          icon: '💪',
          description: '운동 습관을 만들고 꾸준히 이어가는 공간',
          members: 54,
          activity: '매우 활발'
        },
        {
          id: 'study',
          name: '공부하기',
          icon: '📖',
          description: '공부 루틴을 정착시키고 학습 동기를 유지하는 곳',
          members: 43,
          activity: '활발'
        }
      ]
    };

    this.availableChannels.set(channelData[groupId] || []);
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
      // await this.groupService.joinGroup(group.id, Array.from(channels));
      
      // 임시: localStorage에 참여 정보 저장
      const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
      const groupData = {
        groupName: group.name,
        channels: Array.from(channels),
        joinedAt: new Date().toISOString()
      };
      
      if (!joinedGroups.find((g: any) => g.groupName === group.name)) {
        joinedGroups.push(groupData);
        localStorage.setItem('joinedGroups', JSON.stringify(joinedGroups));
      }

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