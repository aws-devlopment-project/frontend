import { Component, signal, OnInit, OnDestroy, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatInputModule } from "@angular/material/input";
import { MatFormFieldModule } from "@angular/material/form-field";
import { FormsModule } from "@angular/forms";
import { Subject } from "rxjs";

import { GroupDashboardService } from "../../Service/GroupDashboard";
import { Quest, Stat } from "../../Models/GroupDashboardModels";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { UserService } from "../../../Core/Service/UserService";
import { Group } from "../../../Core/Models/group";
import { UserQuestCur } from "../../../Core/Models/user";

interface EnhancedQuest extends Quest {
  isPersonallyCompleted: boolean;
  isSelectable: boolean;
  groupCompletions: number;
  totalMembers: number;
  clubName: string;
}

interface FeedbackData {
  questId: string;
  questTitle: string;
  groupName: string;
}

interface QuestCompletionData {
  questId: string;
  questTitle: string;
  questDescription: string;
}

@Component({
  selector: 'app-group-dashboard',
  templateUrl: './GroupDashboard.html',
  styleUrl: './GroupDashboard.css',
  imports: [
    CommonModule, 
    MatIconModule, 
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule
  ],
  standalone: true
})
export class GroupDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private groupCache: Group | undefined = undefined;
  private userQuestCache: UserQuestCur | null = null;

  // === 핵심 상태 관리 ===
  readonly title = signal<string>("");
  readonly quests = signal<Quest[]>([]);
  readonly stats = signal<Stat[]>([]);

  // === UI 상태 ===
  readonly isLoading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // === 퀘스트 완료 확인 모달 ===
  readonly showQuestConfirmModal = signal<boolean>(false);
  readonly questConfirmData = signal<QuestCompletionData | null>(null);
  readonly isCompletingQuest = signal<boolean>(false);

  // === 피드백 관련 ===
  readonly showFeedback = signal<boolean>(false);
  readonly feedbackData = signal<FeedbackData | null>(null);
  readonly feedbackText = signal<string>('');
  readonly feedbackLike = signal<boolean | null>(null);
  readonly isSubmittingFeedback = signal<boolean>(false);

  // === Computed signals ===
  readonly isFeedbackValid = computed(() => {
    const hasLikeSelection = this.feedbackLike() !== null;
    const text = this.feedbackText()?.trim() || '';
    const hasValidText = text.length >= 5 && text.length <= 200;
    return hasLikeSelection && hasValidText;
  });
  readonly feedbackTextLength = computed(() => this.feedbackText()?.length || 0);
  readonly achievementRate = computed(() => {
    const quests = this.quests();
    if (quests.length === 0) return 0;
    const completed = quests.filter((q: Quest) => this.isPersonallyCompleted(q)).length;
    return Math.round((completed / quests.length) * 100);
  });

  constructor(
    private groupDashboardService: GroupDashboardService,
    private shared: SharedStateService,
    private userService: UserService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.loadData();
    } catch (error) {
      this.handleError(error, '초기화');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    
    try {
      const groupName = this.shared.selectedGroup();
      if (!groupName) {
        throw new Error('선택된 그룹이 없습니다.');
      }

      // 병렬로 데이터 로드
      const [groupData, userQuestData] = await Promise.all([
        this.loadGroupData(groupName),
        this.loadUserQuestData()
      ]);

      this.processQuests();
      this.updateStats();
      
    } catch (error) {
      this.handleError(error, '데이터 로딩');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadGroupData(groupName: string): Promise<void> {
    this.groupCache = await this.groupDashboardService.getGroupData(groupName);
    if (!this.groupCache) {
      throw new Error('그룹 데이터를 찾을 수 없습니다.');
    }
    this.title.set(this.groupCache.name);
  }

  private async loadUserQuestData(): Promise<void> {
    const userId = this.shared.currentUser()?.id;
    if (!userId) return;
    
    this.userQuestCache = await this.userService.getUserQuestCur(userId);
  }

  private processQuests(): void {
    if (!this.userQuestCache || !this.groupCache) {
      this.quests.set([]);
      return;
    }

    const groupName = this.shared.selectedGroup();
    if (!groupName) return;

    const currentGroupQuests = this.userQuestCache.curQuestTotalList.filter(
      quest => quest.group === groupName
    );

    const processedQuests = currentGroupQuests.map(questRecord => {
      // 그룹 진행률 계산
      const questIndex = this.groupCache!.questList.indexOf(questRecord.quest);
      const groupCompletions = questIndex !== -1 ? 
        (this.groupCache!.questSuccessNum[questIndex] || 0) : 0;
      const progress = this.calculateProgress(groupCompletions, this.groupCache!.memberNum);

      return {
        id: questRecord.questId.toString(),
        title: questRecord.quest,
        description: questRecord.descriptions || `${questRecord.quest} 퀘스트를 완료하세요`,
        icon: this.getQuestIcon(questRecord.quest),
        progress: progress,
        status: this.determineStatus(questRecord.success, progress),
        isPersonallyCompleted: questRecord.success,
        isSelectable: !questRecord.success,
        groupCompletions: groupCompletions,
        totalMembers: this.groupCache!.memberNum,
        clubName: questRecord.club
      } as EnhancedQuest;
    });

    this.quests.set(processedQuests);
  }

  private calculateProgress(successCount: number, memberCount: number): number {
    if (memberCount === 0) return 0;
    return Math.min(Math.floor((successCount / memberCount) * 100), 100);
  }

  private determineStatus(isCompleted: boolean, progress: number): Quest['status'] {
    if (isCompleted) return 'completed';
    if (progress >= 100) return 'completed';
    if (progress > 0) return 'in-progress';
    return 'not-started';
  }

  private getQuestIcon(questTitle: string): string {
    const iconMap: { [key: string]: string } = {
      'quest1': '💪', 'quest2': '📚', 'quest3': '💧',
      'a': '💪', 'b': '📚', 'c': '💧',
      'exercise': '🏃‍♂️', 'reading': '📖', 'water': '💧'
    };
    return iconMap[questTitle.toLowerCase()] || '⭐';
  }

  private updateStats(): void {
    if (!this.groupCache) return;
    
    this.stats.set([
      {
        id: '1',
        label: '전체 멤버',
        value: this.groupCache.memberNum,
        icon: 'group',
        unit: '명'
      },
      {
        id: '2',
        label: '개인 달성률',
        value: this.achievementRate(),
        icon: 'thumb_up',
        unit: '%'
      },
      {
        id: '3',
        label: '소모임 수',
        value: this.groupCache.clubList?.length || 0,
        icon: 'star',
        unit: '개'
      }
    ]);
  }

  // === 퀘스트 개별 완료 처리 ===
  onQuestClick(quest: Quest): void {
    const enhancedQuest = quest as EnhancedQuest;
    
    // 이미 완료된 퀘스트는 클릭할 수 없음
    if (enhancedQuest.isPersonallyCompleted) {
      this.showToast('error', '이미 완료된 퀘스트입니다.');
      return;
    }
    
    // 완료 가능한 퀘스트만 처리
    if (!enhancedQuest.isSelectable) {
      this.showToast('error', '완료할 수 없는 퀘스트입니다.');
      return;
    }

    // 퀘스트 완료 확인 모달 표시
    this.showQuestCompletionModal(quest);
  }

  private showQuestCompletionModal(quest: Quest): void {
    this.questConfirmData.set({
      questId: quest.id,
      questTitle: quest.title,
      questDescription: quest.description
    });
    this.showQuestConfirmModal.set(true);
  }

  async confirmSingleQuestCompletion(): Promise<void> {
    const questData = this.questConfirmData();
    if (!questData) return;

    this.isCompletingQuest.set(true);
    
    try {
      const quest = this.quests().find(q => q.id === questData.questId);
      if (!quest) {
        throw new Error('퀘스트를 찾을 수 없습니다.');
      }

      await this.completeQuest(quest);
      this.closeQuestConfirmModal();
      
    } catch (error) {
      this.handleError(error, '퀘스트 완료');
    } finally {
      this.isCompletingQuest.set(false);
    }
  }

  private async completeQuest(quest: Quest): Promise<void> {
    try {
      const userId = this.shared.currentUser()?.id;
      const groupName = this.shared.selectedGroup();
      
      if (!userId || !groupName) {
        throw new Error('사용자 또는 그룹 정보가 없습니다.');
      }

      this.updateQuestUI(quest);
      this.showQuestCompletionFeedback(quest);
      await this.refreshData();
      
    } catch (error) {
      this.handleError(error, '퀘스트 완료');
    }
  }

  private updateQuestUI(quest: Quest): void {
    this.quests.update(quests => 
      quests.map(q => 
        q.id === quest.id 
          ? { ...q, status: 'completed' as const, progress: 100, isPersonallyCompleted: true }
          : q
      )
    );
  }

  // === 피드백 시스템 ===
  private showQuestCompletionFeedback(quest: Quest): void {
    const groupName = this.shared.selectedGroup();
    if (!groupName) return;

    this.feedbackData.set({
      questId: quest.id,
      questTitle: quest.title,
      groupName
    });

    this.resetFeedbackForm();
    this.showFeedback.set(true);
  }

  async submitFeedback(): Promise<void> {
    const data = this.feedbackData();
    const text = this.feedbackText()?.trim();
    const isLike = this.feedbackLike();
    const userId = this.shared.currentUser()?.id;

    if (!data || !this.isFeedbackValid() || !userId || isLike === null || !text) {
      return;
    }

    this.isSubmittingFeedback.set(true);

    try {
      const success = await this.groupDashboardService.questSuccessWithFeedback(
        data.groupName,
        userId,
        data.questTitle,
        text,
        isLike
      );

      if (success) {
        this.closeFeedback();
        this.showToast('success', '피드백이 저장되었습니다! 감사합니다.');
        await this.refreshData();
      } else {
        throw new Error('피드백 전송에 실패했습니다.');
      }
    } catch (error) {
      this.handleError(error, '피드백 전송');
    } finally {
      this.isSubmittingFeedback.set(false);
    }
  }

  private resetFeedbackForm(): void {
    this.feedbackText.set('');
    this.feedbackLike.set(null);
  }

  // === UI 이벤트 핸들러 ===
  onFeedbackTextChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    if (target) {
      this.feedbackText.set(target.value);
    }
  }

  setFeedbackLike(isLike: boolean): void {
    this.feedbackLike.set(isLike);
  }

  closeFeedback(): void {
    this.showFeedback.set(false);
    this.feedbackData.set(null);
    this.resetFeedbackForm();
  }

  closeQuestConfirmModal(): void {
    this.showQuestConfirmModal.set(false);
    this.questConfirmData.set(null);
  }

  cancelQuestCompletion(): void {
    this.closeQuestConfirmModal();
  }

  async refreshData(): Promise<void> {
    try {
      await this.loadData();
    } catch (error) {
      this.handleError(error, '데이터 새로고침');
    }
  }

  // === 상태 확인 메서드들 ===
  canSelectQuest(quest: Quest): boolean {
    if (!quest) return false;
    const enhancedQuest = quest as EnhancedQuest;
    return enhancedQuest.isSelectable && !enhancedQuest.isPersonallyCompleted;
  }

  isPersonallyCompleted(quest: Quest): boolean {
    if (!quest) return false;
    const enhancedQuest = quest as EnhancedQuest;
    return enhancedQuest.isPersonallyCompleted || false;
  }

  getQuestCardClass(quest: Quest): string {
    if (!quest) return 'quest-card disabled';
    
    const enhancedQuest = quest as EnhancedQuest;
    const classes = ['quest-card'];
    
    if (enhancedQuest.isPersonallyCompleted) {
      classes.push('completed');
    } else if (enhancedQuest.isSelectable) {
      classes.push('selectable');
    } else {
      classes.push('disabled');
    }
    
    return classes.join(' ');
  }

  getStatusColor(status: string): string {
    if (!status) return '#a0aec0';
    
    const colorMap = {
      'completed': '#48bb78',
      'in-progress': '#4299e1',
      'not-started': '#a0aec0'
    };
    return colorMap[status as keyof typeof colorMap] || '#a0aec0';
  }

  getGroupProgressText(quest: Quest): string {
    if (!quest) return '0명 / 0명 완료';
    
    const enhancedQuest = quest as EnhancedQuest;
    return `${enhancedQuest.groupCompletions || 0}명 / ${enhancedQuest.totalMembers || 0}명 완료`;
  }

  getPersonalStatusIcon(quest: Quest): string {
    if (!quest) return 'block';
    
    const enhancedQuest = quest as EnhancedQuest;
    if (enhancedQuest.isPersonallyCompleted) return 'check_circle';
    if (enhancedQuest.isSelectable) return 'radio_button_unchecked';
    return 'block';
  }

  getPersonalStatusColor(quest: Quest): string {
    if (!quest) return '#a0aec0';
    
    const enhancedQuest = quest as EnhancedQuest;
    if (enhancedQuest.isPersonallyCompleted) return '#48bb78';
    if (enhancedQuest.isSelectable) return '#3182ce';
    return '#a0aec0';
  }

  getCompletedQuestCount(): number {
    const quests = this.quests();
    return quests.filter((q: Quest) => this.isPersonallyCompleted(q)).length;
  }

  // === 유틸리티 메서드들 ===
  private handleError(error: any, context: string): void {
    console.error(`Error in ${context}:`, error);
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    this.error.set(message);
  }

  retry(): void {
    this.error.set(null);
    this.loadData();
  }

  private showToast(type: 'success' | 'error', message: string): void {
    const toast = document.createElement('div');
    const isSuccess = type === 'success';
    
    toast.className = isSuccess ? 'toast success' : 'toast error';
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">${isSuccess ? '✅' : '⚠️'}</div>
        <div class="toast-message">${message}</div>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }
}