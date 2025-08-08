// GroupDashboard.ts - 퀘스트 완료 알림 연동 버전
import { Component, signal, OnInit, OnDestroy, effect } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { Router } from "@angular/router";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";

import { GroupDashboardService } from "../../Service/GroupDashboard";
import { Quest, Stat } from "../../Models/GroupDashboardModels";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { UserService } from "../../../Core/Service/UserService";
import { LocalActivityService } from "../../Service/LocalActivityService";

interface QuestCompletionEvent {
  questId: string;
  questTitle: string;
  groupName: string;
  channelName: string;
  userId: string;
  completedAt: Date;
}

@Component({
  selector: 'app-group-dashboard',
  templateUrl: './GroupDashboard.html',
  styleUrl: './GroupDashboard.css',
  imports: [CommonModule, MatIconModule],
  providers: [GroupDashboardService],
  standalone: true
})
export class GroupDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private completedQuestIds = new Set<string>(); // 이미 처리된 퀘스트 추적

  // 데이터 signals
  title = signal<string>("");
  quests = signal<Quest[]>([]);
  selectedQuestIds = signal<Set<string>>(new Set());
  stats = signal<Stat[]>([
    { id: '1', label: '전체 멤버', value: 0, icon: 'group', unit: '명' },
    { id: '2', label: '퀘스트 달성률', value: 0, icon: 'thumb_up', unit: '%' },
    { id: '3', label: '소모임 수', value: 0, icon: 'star', unit: '개' }
  ]);

  // 상태 signals
  readonly isLoading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  constructor(
    private groupDashboardService: GroupDashboardService,
    private shared: SharedStateService,
    private router: Router,
    private userService: UserService,
    private activityService: LocalActivityService
  ) {
    // 퀘스트 상태 변화 모니터링
    this.monitorQuestChanges();
  }

  async ngOnInit(): Promise<void> {
    console.log("GroupDashboard initialized");
    await this.ensureGroupSelected();
    await this.loadGroupData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // === 퀘스트 변화 모니터링 ===
  
  private monitorQuestChanges(): void {
    // quests signal 변화 감지
    effect(() => {
      const currentQuests = this.quests();
      const completedQuests = currentQuests.filter(quest => quest.status === 'completed');
      
      // 새로 완료된 퀘스트들 찾기
      const newlyCompleted = completedQuests.filter(quest => 
        !this.completedQuestIds.has(quest.id)
      );

      if (newlyCompleted.length > 0) {
        console.log('New quest completions detected:', newlyCompleted.length);
        this.handleQuestCompletions(newlyCompleted);
        
        // 완료된 퀘스트 ID 추가
        newlyCompleted.forEach(quest => {
          this.completedQuestIds.add(quest.id);
        });
      }
    });
  }

  private async handleQuestCompletions(completedQuests: Quest[]): Promise<void> {
    const groupName = this.shared.selectedGroup();
    const channelName = this.shared.selectedChannel();
    const userId = this.shared.currentUser()?.id;

    if (!groupName || !userId) {
      console.warn('Missing group or user information for quest completion');
      return;
    }

    for (const quest of completedQuests) {
      // LocalActivityService를 통해 퀘스트 완료 추적
      await this.activityService.trackQuestCompletion(
        groupName, 
        [quest.title]
      );

      // 퀘스트 완료 이벤트 생성
      const completionEvent: QuestCompletionEvent = {
        questId: quest.id,
        questTitle: quest.title,
        groupName,
        channelName: channelName || '',
        userId,
        completedAt: new Date()
      };

      console.log('Quest completion event:', completionEvent);

      // 축하 메시지 표시 (선택사항)
      this.showQuestCompletionToast(quest.title);
    }
  }

  private showQuestCompletionToast(questTitle: string): void {
    // 간단한 토스트 알림 (실제로는 더 정교한 토스트 서비스 사용 권장)
    const toast = document.createElement('div');
    toast.className = 'quest-completion-toast';
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">🎉</div>
        <div class="toast-message">
          <strong>"${questTitle}"</strong> 퀘스트를 완료했습니다!
        </div>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // 애니메이션 후 제거
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // === 기존 메서드들 (수정된 부분만 표시) ===

  private async ensureGroupSelected(): Promise<void> {
    let selectedGroup = this.shared.selectedGroup();
    
    if (!selectedGroup) {
      console.log('선택된 그룹이 없음. 자동 선택 시도...');
      
      const joinedGroups = await this.getJoinedGroups();
      if (joinedGroups.length > 0) {
        const firstGroup = joinedGroups[0];
        console.log('자동 그룹 선택:', firstGroup);
        this.shared.setSelectedGroup(firstGroup);
      } else {
        console.log('참여한 그룹이 없음. 그룹 참여 페이지로 이동');
        this.navigateToGroupJoin();
        return;
      }
    }
    
    console.log('최종 선택된 그룹:', selectedGroup);
  }

  private async getJoinedGroups(): Promise<string[]> {
    try {
      const userJoin = await this.userService.getUserJoin(this.shared.currentUser()?.id);
      return userJoin ? userJoin.joinList.map(join => join.groupname) : [];
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
      
      // 기존 완료된 퀘스트 상태 유지
      const newQuests = this.groupDashboardService.processingQuest(group);
      const currentQuests = this.quests();
      
      // 이전에 완료된 퀘스트들의 상태 복원
      const updatedQuests = newQuests.map(newQuest => {
        const existingQuest = currentQuests.find(q => q.id === newQuest.id);
        if (existingQuest && existingQuest.status === 'completed') {
          return { ...newQuest, status: 'completed' as const };
        }
        return newQuest;
      });

      this.quests.set(updatedQuests);
      this.stats.set(this.groupDashboardService.processingStat(group));

      // 완료된 퀘스트 ID 재설정
      this.completedQuestIds.clear();
      updatedQuests.forEach(quest => {
        if (quest.status === 'completed') {
          this.completedQuestIds.add(quest.id);
        }
      });

      console.log('그룹 데이터 로딩 완료:', {
        title: this.title(),
        questsCount: this.quests().length,
        completedQuests: Array.from(this.completedQuestIds),
        statsCount: this.stats().length
      });

      setTimeout(() => this.animateProgress(), 500);

    } catch (error) {
      console.error('그룹 데이터 로딩 실패:', error);
      this.error.set(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // === 퀘스트 관련 메서드 (기존 유지) ===
  
  onQuestClick(quest: Quest): void {
    if (quest.status === 'completed') {
      return;
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

    // 확인 대화상자
    const questNames = selectedQuests.map(q => q.title).join(', ');
    const confirmMessage = `선택한 퀘스트들을 완료하시겠습니까?\n\n${questNames}`;
    
    if (confirm(confirmMessage)) {
      // 선택된 퀘스트들을 순차적으로 완료 처리
      selectedQuests.forEach((quest, index) => {
        setTimeout(() => {
          this.completeQuest(quest.id);
        }, index * 300);
      });
    }
  }

  private completeQuest(questId: string): void {
    const currentQuests = this.quests();
    const updatedQuests = currentQuests.map(quest => {
      if (quest.id === questId) {
        return {
          ...quest,
          status: 'completed' as const,
          progress: 100 // 완료 시 100%로 설정
        };
      }
      return quest;
    });

    // 서버에 퀘스트 완료 상태 업데이트
    const userId = this.shared.currentUser()?.id;
    const groupName = this.shared.selectedGroup();
    
    if (userId && groupName) {
      this.groupDashboardService.questClear(userId, groupName, updatedQuests);
    }

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

  // === 기존 메서드들 (변경 없음) ===

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

  // === 디버깅 메서드 ===

  getCompletedQuestIds(): string[] {
    return Array.from(this.completedQuestIds);
  }

  resetQuestCompletions(): void {
    this.completedQuestIds.clear();
    console.log('Quest completion tracking reset');
  }
}