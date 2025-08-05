import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { Router } from "@angular/router";
import { GroupDashboardService } from "../../Service/GroupDashboard";
import { Quest, Stat } from "../../Models/GroupDashboardModels";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { UserService } from "../../../Core/Service/UserService";

@Component({
  selector: 'app-group-dashboard',
  templateUrl: './GroupDashboard.html',
  styleUrl: './GroupDashboard.css',
  imports: [CommonModule, MatIconModule],
  providers: [GroupDashboardService],
  standalone: true
})
export class GroupDashboardComponent implements OnInit {
  // 데이터 signals
  title = signal<string>("");
  quests = signal<Quest[]>([]);
  selectedQuestIds = signal<Set<string>>(new Set());
  stats = signal<Stat[]>([
    { id: '1', label: '전체 멤버', value: 0, icon: 'group', unit: '명' },
    { id: '2', label: '퀘스트 달성률', value: 0, icon: 'thumb_up', unit: '%' },
    { id: '3', label: '소모임 수', value: 0, icon: 'star', unit: '개' }
  ]);

  // 상태 signals - 명시적으로 선언
  readonly isLoading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  constructor(
    private groupDashboardService: GroupDashboardService,
    private shared: SharedStateService,
    private router: Router,
    private userService: UserService
  ) {}

  async ngOnInit(): Promise<void> {
    // 그룹 선택 상태 확인 및 처리
    await this.ensureGroupSelected();
    await this.loadGroupData();
  }

  private async ensureGroupSelected(): Promise<void> {
    let selectedGroup = this.shared.selectedGroup();
    
    if (!selectedGroup) {
      console.log('선택된 그룹이 없음. 자동 선택 시도...');
      
      // 1. localStorage에서 참여한 그룹 확인
      const joinedGroups = await this.getJoinedGroups();
      if (joinedGroups.length > 0) {
        // 첫 번째 그룹 자동 선택
        const firstGroup = joinedGroups[0];
        console.log('자동 그룹 선택:', firstGroup);
        
        this.shared.setSelectedGroup(firstGroup);
      } else {
        // 참여한 그룹이 없으면 그룹 참여 페이지로 리다이렉트
        console.log('참여한 그룹이 없음. 그룹 참여 페이지로 이동');
        this.navigateToGroupJoin();
        return;
      }
    }
    
    console.log('최종 선택된 그룹:', selectedGroup);
  }

  private async getJoinedGroups(): Promise<string[]> {
    try {
      const userJoinList = await this.userService.getUserJoinList(this.shared.currentUser()?.name);
      const joinedGroups = userJoinList ? userJoinList.joinList.map(join => join.groupname) : [];
      return joinedGroups ? joinedGroups : [];
    } catch (error) {
      console.error('참여 그룹 조회 실패:', error);
      return [];
    }
  }

  private navigateToGroupJoin(): void {
    console.log('그룹 참여 페이지로 이동');
    this.router.navigate(['/group/join']);
  }

  private async loadGroupData(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const selectedGroup = this.shared.selectedGroup();
      
      if (!selectedGroup) {
        throw new Error('선택된 그룹이 없습니다.');
      }

      console.log('그룹 데이터 로딩 시작:', selectedGroup);

      const group = await this.groupDashboardService.getGroupData(selectedGroup);
      
      if (!group) {
        throw new Error('그룹 데이터를 찾을 수 없습니다.');
      }

      // 데이터 설정
      this.title.set(group.name);
      this.quests.set(this.groupDashboardService.processingQuest(group));
      this.stats.set(this.groupDashboardService.processingStat(group));

      console.log('그룹 데이터 로딩 완료:', {
        title: this.title(),
        questsCount: this.quests().length,
        statsCount: this.stats().length
      });

      // 진행률 애니메이션 시작
      setTimeout(() => this.animateProgress(), 500);

    } catch (error) {
      console.error('그룹 데이터 로딩 실패:', error);
      this.error.set(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // === 퀘스트 관련 메서드 ===
  
  onQuestClick(quest: Quest): void {
    if (quest.status === 'completed') {
      return; // 완료된 퀘스트는 선택할 수 없음
    }
    
    const currentSelected = this.selectedQuestIds();
    const newSelected = new Set(currentSelected);
    
    if (newSelected.has(quest.id)) {
      newSelected.delete(quest.id);
    } else {
      newSelected.add(quest.id);
    }
    
    this.selectedQuestIds.set(newSelected);
  }

  isQuestSelected(questId: string): boolean {
    return this.selectedQuestIds().has(questId);
  }

  hasSelectedQuests(): boolean {
    return this.selectedQuestIds().size > 0;
  }

  onQuestAction(): void {
    const selectedIds = Array.from(this.selectedQuestIds());
    const selectedQuests = this.quests().filter(quest => selectedIds.includes(quest.id));
    
    if (selectedQuests.length === 0) {
      alert('완료할 퀘스트를 선택해주세요.');
      return;
    }

    // 선택된 퀘스트들을 순차적으로 완료 처리
    selectedQuests.forEach((quest, index) => {
      setTimeout(() => {
        this.completeQuest(quest.id);
      }, index * 300);
    });
  }

  private completeQuest(questId: string): void {
    const currentQuests = this.quests();
    const updatedQuests = currentQuests.map(quest => {
      if (quest.id === questId) {
        return {
          ...quest,
          status: 'completed' as const
        };
      }

      return quest;
    });
    let id = this.shared.currentUser()?.id;
    if (id)
      this.groupDashboardService.questClear(id, this.shared.selectedGroup(), updatedQuests);
    this.quests.set(updatedQuests);
    
    // 선택 목록에서 제거
    const currentSelected = this.selectedQuestIds();
    const newSelected = new Set(currentSelected);
    newSelected.delete(questId);
    this.selectedQuestIds.set(newSelected);
    
    // 통계 업데이트
    this.updateStats();
    
    console.log(`Quest ${questId} completed!`);
  }

  // === 상태 관련 메서드 ===

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return '#48bb78';
      case 'in-progress': return '#4299e1';
      case 'pending': return '#a0aec0';
      default: return '#a0aec0';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'completed': return '완료';
      case 'in-progress': return '진행중';
      case 'pending': return '대기중';
      default: return '알 수 없음';
    }
  }

  // === 통계 관련 메서드 ===

  getTodayAchievementRate(): number {
    const statsList = this.stats();
    if (statsList.length > 1 && statsList[1]) {
      return statsList[1].value;
    }
    return 0;
  }

  private updateStats(): void {
    const totalQuests = this.quests().length;
    const completedQuests = this.quests().filter(q => q.status === 'completed').length;
    const achievementRate = totalQuests > 0 ? Math.round((completedQuests / totalQuests) * 100) : 0;
    
    const currentStats = this.stats();
    const updatedStats = currentStats.map(stat => {
      if (stat.label === '퀘스트 달성률') {
        return { ...stat, value: achievementRate };
      }
      return stat;
    });
    
    this.stats.set(updatedStats);
  }

  // === 애니메이션 ===

  private animateProgress(): void {
    const progressBars = document.querySelectorAll('.quest-progress-bar') as NodeListOf<HTMLElement>;
    
    progressBars.forEach((bar, index) => {
      const targetWidth = bar.getAttribute('data-progress') + '%';
      bar.style.width = '0%';
      
      setTimeout(() => {
        bar.style.width = targetWidth;
        bar.style.transition = 'width 0.8s ease-out';
      }, index * 200);
    });
  }

  // === 액션 메서드 ===

  retry(): void {
    this.loadGroupData();
  }

  refreshData(): void {
    this.loadGroupData();
  }
}