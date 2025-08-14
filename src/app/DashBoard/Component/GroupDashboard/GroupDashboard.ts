import { Component, signal, OnInit, OnDestroy, effect, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule, MatDialog } from "@angular/material/dialog";
import { MatInputModule } from "@angular/material/input";
import { MatFormFieldModule } from "@angular/material/form-field";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { Subject } from "rxjs";

import { GroupDashboardService } from "../../Service/GroupDashboard";
import { Quest, Stat } from "../../Models/GroupDashboardModels";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { UserService } from "../../../Core/Service/UserService";
import { LocalActivityService } from "../../Service/LocalActivityService";
import { QuestFeedbackService } from "../../Service/QuestFeedbackSystem";
import { Group } from "../../../Core/Models/group";
import { UserQuestCur } from "../../../Core/Models/user";
import { OfflineQuestService } from "../../../Core/Service/OfflineQuestService";
import { GroupService } from "../../../Core/Service/GroupService";

// === 인터페이스 정의 ===
interface QuestCompletionState {
  completedQuestIds: Set<string>;
  completedQuestTitles: Set<string>;
  lastSyncTime: number;
}

interface FeedbackData {
  questId: string;
  questTitle: string;
  groupName: string;
  clubName: string;
}

interface RecentActivity {
  id: string;
  type: 'quest_complete' | 'user_join' | 'achievement' | 'milestone';
  title: string;
  description: string;
  timestamp: Date;
  user?: string;
  avatar?: string;
  badge?: {
    text: string;
    type: 'success' | 'info' | 'warning';
  };
  metadata?: {
    questTitle?: string;
    achievementLevel?: number;
    streakDays?: number;
  };
}

@Component({
  selector: 'app-group-dashboard',
  templateUrl: './GroupDashboard.html',
  styleUrl: './GroupDashboard.css',
  imports: [
    CommonModule, 
    MatIconModule, 
    MatButtonModule, 
    MatDialogModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule
  ],
  providers: [
    GroupDashboardService,
    GroupService,        // 추가
    UserService         // 추가 (필요한 경우)
  ],
  standalone: true
})
export class GroupDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private groupCache: Group | undefined = undefined;
  private userQuestCache: UserQuestCur | null = null;
  private lastDataSyncTime = 0;
  private readonly DATA_SYNC_DEBOUNCE_MS = 1000;

  // === UserQuestCur 중심의 상태 관리 ===
  private questState = signal<QuestCompletionState>({
    completedQuestIds: new Set(),
    completedQuestTitles: new Set(),
    lastSyncTime: 0
  });

  // === 기본 데이터 signals ===
  readonly title = signal<string>("");
  readonly quests = signal<Quest[]>([]);
  readonly selectedQuestIds = signal<Set<string>>(new Set());
  readonly stats = signal<Stat[]>([
    { id: '1', label: '전체 멤버', value: 0, icon: 'group', unit: '명' },
    { id: '2', label: '퀘스트 달성률', value: 0, icon: 'thumb_up', unit: '%' },
    { id: '3', label: '소모임 수', value: 0, icon: 'star', unit: '개' }
  ]);
  readonly recentActivities = signal<RecentActivity[]>([]);

  // === 상태 signals ===
  readonly isLoading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // === 피드백 관련 signals ===
  readonly showFeedback = signal<boolean>(false);
  readonly feedbackData = signal<FeedbackData | null>(null);
  readonly feedbackText = signal<string>('');
  readonly feedbackLike = signal<boolean | null>(null);
  readonly isSubmittingFeedback = signal<boolean>(false);

  // === 모달 관련 signals ===
  readonly showConfirmModal = signal<boolean>(false);
  readonly confirmModalData = signal<{
    questNames: string[];
    questCount: number;
  } | null>(null);

  // === Computed signals ===
  readonly hasCompletedQuests = computed(() => {
    return this.quests().some(quest => this.isQuestCompletedByQuestId(quest.id));
  });

  readonly hasSelectedQuests = computed(() => {
    return this.selectedQuestIds().size > 0;
  });

  readonly isFeedbackValid = computed(() => {
    const hasLikeSelection = this.feedbackLike() !== null;
    const text = this.feedbackText()?.trim() || '';
    const hasValidText = text.length >= 5 && text.length <= 200;
    return hasLikeSelection && hasValidText;
  });

  readonly feedbackTextLength = computed(() => 
    this.feedbackText()?.length || 0
  );

  readonly feedbackDataTitle = computed(() => 
    this.feedbackData()?.questTitle || ''
  );

  // === 활동 통계 computed signals ===
  readonly recentQuestCompletions = computed(() => 
    this.recentActivities().filter(a => a.type === 'quest_complete').length
  );
  
  readonly currentStreak = computed(() => 
    this.activityService.getCurrentStreak()
  );
  
  readonly recentNewMembers = computed(() => 
    this.recentActivities().filter(a => a.type === 'user_join').length
  );

  constructor(
    private groupDashboardService: GroupDashboardService,
    private shared: SharedStateService,
    private router: Router,
    private userService: UserService,
    private activityService: LocalActivityService,
    private feedbackService: QuestFeedbackService,
    private dialog: MatDialog,
    private offlineQuestService: OfflineQuestService
  ) {
    this.setupQuestMonitoring();
    this.setupOfflineEventListeners();
  }

  // === 생명주기 메서드 ===
  async ngOnInit(): Promise<void> {
    try {
      await this.initializeComponent();
    } catch (error) {
      this.handleError(error, '컴포넌트 초기화');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // === 초기화 메서드들 ===
  private async initializeComponent(): Promise<void> {
    await this.ensureGroupSelected();
    await this.loadAllData();
    this.scheduleAutoSync();
    this.cleanupOldData();
  }

  private async ensureGroupSelected(): Promise<void> {
    const selectedGroup = this.shared.selectedGroup();
    if (selectedGroup) return;

    const joinedGroups = await this.getJoinedGroups();
    if (joinedGroups.length > 0) {
      this.shared.setSelectedGroup(joinedGroups[0]);
    } else {
      this.navigateToGroupJoin();
    }
  }

  private async loadAllData(): Promise<void> {
    this.isLoading.set(true);
    
    try {
      // UserQuestCur를 먼저 로드 (핵심 데이터)
      await this.loadUserQuestData();
      
      // 그룹 데이터 로드
      await this.loadGroupData();
      
      // UserQuestCur 기반으로 퀘스트 처리
      this.processQuestsFromUserQuestCur();
      
      // 활동 데이터 로드
      await this.loadRecentActivities();
      
    } catch (error) {
      this.handleError(error, '데이터 로딩');
    } finally {
      this.isLoading.set(false);
    }
  }

  // === UserQuestCur 중심 데이터 로딩 ===
  private async loadUserQuestData(): Promise<void> {
    const userId = this.shared.currentUser()?.id;
    if (!userId) return;

    this.userQuestCache = await this.userService.getUserQuestCur(userId);
    this.syncQuestStateFromUserQuestCur();
  }

  private async loadGroupData(): Promise<void> {
    const selectedGroup = this.shared.selectedGroup();
    if (!selectedGroup) {
      throw new Error('선택된 그룹이 없습니다.');
    }

    this.groupCache = await this.groupDashboardService.getGroupData(selectedGroup);
    if (!this.groupCache) {
      throw new Error('그룹 데이터를 찾을 수 없습니다.');
    }

    this.title.set(this.groupCache.name);
    this.updateStats();
  }

  // === UserQuestCur 기반 퀘스트 처리 (핵심) ===
  private processQuestsFromUserQuestCur(): void {
    if (!this.userQuestCache || !this.groupCache) {
      this.quests.set([]);
      return;
    }

    const groupName = this.shared.selectedGroup();
    if (!groupName) return;

    // UserQuestCur에서 현재 그룹의 퀘스트들만 필터링
    const currentGroupQuests = this.userQuestCache.curQuestTotalList.filter(
      quest => quest.group === groupName
    );

    // UserQuestCur 기반으로 Quest 객체 생성 (questId 정확히 매핑)
    const questsFromUserData = currentGroupQuests.map(questRecord => {
      // 그룹 캐시에서 성공 횟수 정보 가져오기
      const questIndex = this.groupCache!.questList.indexOf(questRecord.quest);
      const successCount = questIndex !== -1 ? (this.groupCache!.questSuccessNum[questIndex] || 0) : 0;
      const progress = this.calculateProgress(successCount, this.groupCache!.memberNum);

      return {
        id: questRecord.questId.toString(), // ✅ UserQuestCur의 실제 questId 사용
        title: questRecord.quest,
        description: questRecord.descriptions || `${questRecord.quest} 퀘스트를 완료하세요`,
        icon: this.getQuestIcon(questRecord.quest),
        progress: progress,
        status: this.determineQuestStatus(questRecord.success, progress)
      } as Quest;
    });

    this.quests.set(questsFromUserData);
    setTimeout(() => this.animateProgress(), 500);
  }

  private calculateProgress(successCount: number, memberCount: number): number {
    if (memberCount === 0) return 0;
    return Math.min(Math.floor((successCount / memberCount) * 100), 100);
  }

  private determineQuestStatus(isCompleted: boolean, progress: number): Quest['status'] {
    if (isCompleted) return 'completed';
    if (progress >= 100) return 'completed';
    if (progress > 0) return 'in-progress';
    return 'not-started';
  }

  private getQuestIcon(questTitle: string): string {
    const iconMap: { [key: string]: string } = {
      'quest1': '💪',
      'quest2': '📚', 
      'quest3': '💧',
      'a': '💪',
      'b': '📚', 
      'c': '💧',
    };
    return iconMap[questTitle] || '⭐';
  }

  // === UserQuestCur 기반 상태 관리 ===
  private syncQuestStateFromUserQuestCur(): void {
    if (!this.userQuestCache) return;
    
    const groupName = this.shared.selectedGroup();
    if (!groupName) return;

    const newCompletedTitles = new Set<string>();
    const newCompletedIds = new Set<string>();

    // UserQuestCur에서 완료된 퀘스트 찾기
    this.userQuestCache.curQuestTotalList.forEach(questRecord => {
      if (questRecord.group === groupName && questRecord.success) {
        newCompletedTitles.add(questRecord.quest);
        newCompletedIds.add(questRecord.questId.toString()); // ✅ 실제 questId 사용
      }
    });

    this.questState.set({
      completedQuestIds: newCompletedIds,
      completedQuestTitles: newCompletedTitles,
      lastSyncTime: Date.now()
    });

    console.log('🔄 UserQuestCur 기반 상태 동기화:', {
      completedTitles: Array.from(newCompletedTitles),
      completedIds: Array.from(newCompletedIds)
    });
  }

  private isQuestCompletedByQuestId(questId: string): boolean {
    if (!this.userQuestCache) {
      return this.questState().completedQuestIds.has(questId);
    }
    
    const groupName = this.shared.selectedGroup();
    if (!groupName) {
      return this.questState().completedQuestIds.has(questId);
    }

    // ✅ questId로 직접 찾기 (기존은 questTitle로 찾았음)
    const questRecord = this.userQuestCache.curQuestTotalList.find(
      quest => quest.questId.toString() === questId && quest.group === groupName
    );

    const isCompleted = questRecord?.success || false;
    
    // 로컬 상태도 동기화
    if (isCompleted && questRecord) {
      const currentState = this.questState();
      const newCompletedTitles = new Set(currentState.completedQuestTitles);
      const newCompletedIds = new Set(currentState.completedQuestIds);
      
      newCompletedTitles.add(questRecord.quest);
      newCompletedIds.add(questRecord.questId.toString());
      
      this.questState.set({
        ...currentState,
        completedQuestTitles: newCompletedTitles,
        completedQuestIds: newCompletedIds
      });
    }
    
    return isCompleted;
  }

  public isQuestCompletable(quest: Quest): boolean {
    return !this.isQuestCompletedByQuestId(quest.id) && quest.status !== 'completed';
  }

  // === 퀘스트 완료 처리 (UserQuestCur 중심) ===
  async onQuestAction(): Promise<void> {
    const selectedIds = Array.from(this.selectedQuestIds());
    const selectedQuests = this.quests()
      .filter(quest => selectedIds.includes(quest.id) && this.isQuestCompletable(quest));
    
    if (selectedQuests.length === 0) {
      this.showErrorToast('완료할 퀘스트를 선택해주세요.');
      return;
    }

    this.showConfirmationModal(selectedQuests);
  }

  private showConfirmationModal(quests: Quest[]): void {
    this.confirmModalData.set({
      questNames: quests.map(q => q.title),
      questCount: quests.length
    });
    this.showConfirmModal.set(true);
  }

  async confirmQuestCompletion(): Promise<void> {
    this.closeConfirmModal();
    
    const selectedIds = Array.from(this.selectedQuestIds());
    const selectedQuests = this.quests()
      .filter(quest => selectedIds.includes(quest.id) && this.isQuestCompletable(quest));

    for (const [index, quest] of selectedQuests.entries()) {
      setTimeout(() => this.completeQuest(quest), index * 300);
    }
  }

  private async completeQuest(quest: Quest): Promise<void> {
    try {
      await this.processQuestCompletion(quest);
      this.updateQuestUI(quest);
      this.showQuestCompletionFeedback(quest);
    } catch (error) {
      this.handleQuestCompletionError(quest, error);
    }
  }

private async processQuestCompletion(quest: Quest): Promise<void> {
    const userId = this.shared.currentUser()?.id;
    const groupName = this.shared.selectedGroup();
    
    if (!userId || !groupName) {
      throw new Error('사용자 또는 그룹 정보가 없습니다.');
    }

    // ✅ GroupService의 questSuccessWithFeedback 사용 (UserQuestCur도 함께 업데이트됨)
    const success = await this.groupDashboardService.questSuccessWithFeedback(
      groupName, 
      userId, 
      [quest.title],
      '', // 빈 피드백 (실제 피드백은 나중에 별도로 전송)
      undefined
    );

    if (!success) {
      throw new Error('퀘스트 완료 처리에 실패했습니다.');
    }

    // UserQuestCur 캐시 갱신 및 상태 동기화
    await this.refreshUserQuestData();
  }

  private rollbackQuestUI(questId: string): void {
    const quest = this.quests().find(q => q.id === questId);
    if (!quest) {
      console.warn('⚠️ 롤백할 Quest를 찾을 수 없음:', questId);
      return;
    }

    // questId 기반으로 상태 롤백
    this.quests.update(quests => 
      quests.map(q => 
        q.id === questId 
          ? { ...q, status: 'not-started' as const, progress: this.getOriginalProgress(q) }
          : q
      )
    );

    // 완료 상태에서 제거 (questId와 questTitle 모두)
    this.questState.update(state => ({
      ...state,
      completedQuestIds: new Set([...state.completedQuestIds].filter(id => id !== questId)),
      completedQuestTitles: new Set([...state.completedQuestTitles].filter(title => title !== quest.title))
    }));

    console.log(`🔄 Quest UI 롤백 완료: questId=${questId}, title=${quest.title}`);
  }

  private async trackQuestCompletionLocal(groupName: string, questList: string[]): Promise<void> {
    // LocalActivityService의 trackQuestCompletion은 실제 API 호출을 하므로
    // 이미 GroupService로 완료 처리가 된 상태에서는 로컬 추적만 수행
    questList.forEach(quest => {
      this.activityService.trackActivity(
        'quest_complete',
        `${quest} 퀘스트 완료`,
        `${groupName} 그룹에서 "${quest}" 퀘스트를 성공적으로 완료했습니다!`,
        {
          groupName,
          questName: quest,
          questList
        }
      );
    });
  }

  private getOriginalProgress(quest: Quest): number {
    if (!this.groupCache) return 0;
    
    const questIndex = this.groupCache.questList.indexOf(quest.title);
    if (questIndex === -1) return 0;
    
    const successCount = this.groupCache.questSuccessNum[questIndex] || 0;
    return this.calculateProgress(successCount, this.groupCache.memberNum);
  }

  private updateQuestUI(quest: Quest): void {
    // 선택 해제
    this.selectedQuestIds.update(selected => {
      const newSelected = new Set(selected);
      newSelected.delete(quest.id);
      return newSelected;
    });

    // 퀘스트 상태 업데이트
    this.quests.update(quests => 
      quests.map(q => 
        q.id === quest.id 
          ? { ...q, status: 'completed' as const, progress: 100 }
          : q
      )
    );

    // 완료 상태 추가
    this.questState.update(state => ({
      ...state,
      completedQuestIds: new Set([...state.completedQuestIds, quest.id]),
      completedQuestTitles: new Set([...state.completedQuestTitles, quest.title])
    }));
  }

  private handleQuestCompletionError(quest: Quest, error: any): void {
    console.error('Quest 완료 처리 실패:', {
      questId: quest.id,
      questTitle: quest.title,
      error: error.message || error
    });

    if (this.offlineQuestService.shouldUseOfflineMode(error)) {
      this.handleOfflineQuestCompletion(quest);
    } else {
      this.rollbackQuestUI(quest.id); // ✅ questId로 롤백 (기존은 quest.title)
      this.showErrorToast('퀘스트 완료 처리에 실패했습니다.');
    }
  }

  // === UserQuestCur 데이터 새로고침 ===
  private async refreshUserQuestData(): Promise<void> {
    const userId = this.shared.currentUser()?.id;
    if (!userId) return;

    try {
      // UserQuestCur 캐시 무효화 후 재로드
      this.userService['cacheService']?.removeCache('userQuestCur');
      this.userQuestCache = await this.userService.getUserQuestCur(userId);
      
      // 상태 동기화
      this.syncQuestStateFromUserQuestCur();
      
      // 퀘스트 재처리
      this.processQuestsFromUserQuestCur();
      
      console.log('✅ UserQuestCur 데이터 새로고침 완료');
    } catch (error) {
      console.error('❌ UserQuestCur 새로고침 실패:', error);
    }
  }

  // === 피드백 시스템 ===
  private showQuestCompletionFeedback(quest: Quest): void {
    const groupName = this.shared.selectedGroup();
    const clubName = this.shared.selectedChannel() || 'general';
    
    if (!groupName) return;

    this.feedbackData.set({
      questId: quest.id,
      questTitle: quest.title,
      groupName,
      clubName
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
        [data.questTitle],
        text,
        isLike
      );

      if (success) {
        this.closeFeedback();
        this.showFeedbackSuccessToast(isLike);
        await this.refreshUserQuestData();
        await this.trackQuestCompletionLocal(data.groupName, [data.questTitle]);
      } else {
        throw new Error('피드백 전송에 실패했습니다.');
      }
    } catch (error) {
      this.handleError(error, '피드백 전송');
      this.rollbackQuestUI(data.questId); // ✅ questId 사용 (기존은 questTitle)
    } finally {
      this.isSubmittingFeedback.set(false);
    }
  }

  private resetFeedbackForm(): void {
    this.feedbackText.set('');
    this.feedbackLike.set(null);
  }

  // === UI 이벤트 핸들러 ===
  onQuestClick(quest: Quest): void {
    if (!this.isQuestCompletable(quest)) return;
    
    this.selectedQuestIds.update(selected => {
      const newSelected = new Set(selected);
      if (newSelected.has(quest.id)) {
        newSelected.delete(quest.id);
      } else {
        newSelected.add(quest.id);
      }
      return newSelected;
    });
  }

  onFeedbackTextChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    if (target) {
      this.feedbackText.set(target.value);
    }
  }

  setFeedbackLike(isLike: boolean): void {
    this.feedbackLike.set(isLike);
  }

  // === 모달 관리 ===
  closeFeedback(): void {
    const data = this.feedbackData();
    
    // 피드백 없이 건너뛰는 경우에도 questSuccess 호출
    if (data) {
      this.submitQuestWithoutFeedback(data);
    }
    
    this.showFeedback.set(false);
    this.feedbackData.set(null);
    this.resetFeedbackForm();
  }

  private async submitQuestWithoutFeedback(data: FeedbackData): Promise<void> {
    const userId = this.shared.currentUser()?.id;
    if (!userId) return;

    try {
      const success = await this.groupDashboardService.questSuccessWithFeedback(
        data.groupName,
        userId,
        [data.questTitle],
        '',
        undefined
      );

      if (success) {
        await this.refreshUserQuestData();
        await this.trackQuestCompletionLocal(data.groupName, [data.questTitle]);
      } else {
        this.rollbackQuestUI(data.questId); // ✅ questId 사용 (기존은 questTitle)
      }
    } catch (error) {
      console.error('퀘스트 완료 처리 실패:', error);
      this.rollbackQuestUI(data.questId); // ✅ questId 사용 (기존은 questTitle)
    }
  }

  closeConfirmModal(): void {
    this.showConfirmModal.set(false);
    this.confirmModalData.set(null);
  }

  cancelQuestCompletion(): void {
    this.closeConfirmModal();
  }

  // === 데이터 새로고침 ===
  async refreshData(): Promise<void> {
    try {
      await this.loadAllData();
    } catch (error) {
      this.handleError(error, '데이터 새로고침');
    }
  }

  private scheduleDataRefresh(): void {
    setTimeout(async () => {
      await this.refreshUserQuestData();
      await this.loadRecentActivities();
    }, 1000);
  }

  // === 통계 및 상태 관리 ===
  private updateStats(): void {
    if (!this.groupCache) return;

    const totalQuests = this.quests().length;
    const completedQuests = this.quests().filter(q => 
      q.status === 'completed' || this.isQuestCompletedByQuestId(q.id)
    ).length;
    
    const achievementRate = totalQuests > 0 ? Math.round((completedQuests / totalQuests) * 100) : 0;
    
    this.stats.update(currentStats => currentStats.map(stat => {
      switch (stat.label) {
        case '전체 멤버':
          return { ...stat, value: this.groupCache!.memberNum };
        case '퀘스트 달성률':
          return { ...stat, value: achievementRate };
        case '소모임 수':
          return { ...stat, value: this.groupCache!.clubList?.length || 0 };
        default:
          return stat;
      }
    }));
  }

  // === 상태 확인 메서드들 ===
  isQuestSelected(questId: string): boolean {
    return this.selectedQuestIds().has(questId);
  }

  isQuestCompletedInCache(questId: string): boolean {
    console.log(this.questState().completedQuestIds);
    return this.questState().completedQuestIds.has(questId);
  }

  getTodayAchievementRate(): number {
    const statsList = this.stats();
    const achievementStat = statsList.find(stat => stat.label === '퀘스트 달성률');
    return achievementStat?.value || 0;
  }

  // === 스타일 헬퍼들 ===
  getStatusColor(status: string): string {
    const colorMap = {
      'completed': '#48bb78',
      'in-progress': '#4299e1',
      'pending': '#a0aec0',
      'not-started': '#a0aec0'
    };
    return colorMap[status as keyof typeof colorMap] || '#a0aec0';
  }

  getStatusText(status: string): string {
    const textMap = {
      'completed': '완료',
      'in-progress': '진행중',
      'pending': '대기중',
      'not-started': '시작 전'
    };
    return textMap[status as keyof typeof textMap] || '알 수 없음';
  }

  // === 유틸리티 메서드들 ===
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
    this.router.navigate(['/group/join']);
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

  // === 에러 처리 ===
  private handleError(error: any, context: string): void {
    console.error(`Error in ${context}:`, error);
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    this.error.set(message);
  }

  retry(): void {
    this.error.set(null);
    this.loadAllData();
  }

  // === 토스트 메시지들 ===
  private showFeedbackSuccessToast(isLike?: boolean): void {
    const likeText = isLike !== undefined 
      ? (isLike ? ' 👍 좋은 피드백 감사합니다!' : ' 👎 소중한 의견 감사합니다!')
      : '';
    
    this.showToast('success', `✨ 피드백이 저장되었습니다!${likeText}`);
  }

  private showErrorToast(message: string): void {
    this.showToast('error', message);
  }

  private showToast(type: 'success' | 'error', message: string): void {
    const toast = document.createElement('div');
    const isSuccess = type === 'success';
    
    toast.className = isSuccess ? 'feedback-success-toast' : 'error-toast';
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

  // === 오프라인 관련 메서드들 ===
  private setupOfflineEventListeners(): void {
    window.addEventListener('offline-quest-auto-sync', () => {
      this.syncOfflineQuests();
    });
  }

  private async syncOfflineQuests(): Promise<void> {
    const userId = this.shared.currentUser()?.id;
    if (!userId) return;

    try {
      const result = await this.offlineQuestService.syncOfflineQuests(
        async (syncUserId: string, groupName: string, questTitles: string[]) => {
          // ✅ GroupService 기반 동기화 메서드 사용
          return await this.groupDashboardService.syncOfflineQuestCompletion(syncUserId, groupName, questTitles);
        }
      );

      if (result.success > 0) {
        this.showToast('success', `✅ ${result.success}개의 오프라인 퀘스트가 동기화되었습니다.`);
        this.scheduleDataRefresh();
      }

      if (result.failed > 0) {
        this.showToast('error', `⚠️ ${result.failed}개 퀘스트 동기화에 실패했습니다.`);
      }
    } catch (error) {
      console.error('오프라인 퀘스트 동기화 오류:', error);
    }
  }

  private handleOfflineQuestCompletion(quest: Quest): void {
    const userId = this.shared.currentUser()?.id;
    const groupName = this.shared.selectedGroup();
    
    if (!userId || !groupName) return;

    try {
      this.updateQuestUI(quest);
      this.showToast('success', '📱 오프라인 모드로 퀘스트가 저장되었습니다.');
    } catch (error) {
      this.showErrorToast('오프라인 저장에 실패했습니다.');
    }
  }

  // === 자동 동기화 및 정리 ===
  private scheduleAutoSync(): void {
    setTimeout(async () => {
      await this.syncOfflineQuests();
    }, 10000);
  }

  private cleanupOldData(): void {
    this.offlineQuestService.cleanupOldOfflineData(30);
  }

  // === 퀘스트 모니터링 ===
  private setupQuestMonitoring(): void {
    effect(() => {
      const currentQuests = this.quests();
      const completedQuests = currentQuests.filter(quest => quest.status === 'completed');
      
      const questState = this.questState();
      const newlyCompleted = completedQuests.filter(quest => 
        !questState.completedQuestIds.has(quest.id)
      );

      if (newlyCompleted.length > 0) {
        this.handleNewQuestCompletions(newlyCompleted);
      }
    });
  }

  private async handleNewQuestCompletions(completedQuests: Quest[]): Promise<void> {
    for (const quest of completedQuests) {
      try {
        await this.activityService.trackQuestCompletion(
          this.shared.selectedGroup() || '',
          [quest.title]
        );
      } catch (error) {
        console.error('활동 추적 실패:', quest.title, error);
      }
    }
  }

  // === 활동 생성 ===
  private async loadRecentActivities(): Promise<void> {
    try {
      const activities = await this.generateRecentActivities();
      this.recentActivities.set(activities);
    } catch (error) {
      console.error('Error loading recent activities:', error);
      this.recentActivities.set([]);
    }
  }

  private async generateRecentActivities(): Promise<RecentActivity[]> {
    const groupName = this.shared.selectedGroup();
    if (!groupName) return [];

    const activities: RecentActivity[] = [];
    
    // 로컬 활동에서 최근 퀘스트 완료 기록
    const localActivities = this.activityService.activities()
      .filter(activity => 
        activity.type === 'quest_complete' && 
        activity.context?.groupName === groupName &&
        this.isRecentActivity(activity.timestamp)
      )
      .slice(0, 5);

    localActivities.forEach(activity => {
      activities.push({
        id: activity.id,
        type: 'quest_complete',
        title: `${activity.context?.questName || '퀘스트'} 완료`,
        description: `${activity.title}를 성공적으로 완료했습니다`,
        timestamp: activity.timestamp,
        user: this.shared.currentUser()?.name || '사용자',
        badge: { text: '완료', type: 'success' },
        metadata: { questTitle: activity.context?.questName }
      });
    });

    // 연속 퀘스트 달성 기록
    const streakData = this.currentStreak();
    if (streakData >= 3) {
      activities.push({
        id: 'streak-' + Date.now(),
        type: 'achievement',
        title: `${streakData}일 연속 활동!`,
        description: '꾸준한 노력이 빛을 발하고 있습니다',
        timestamp: new Date(),
        user: this.shared.currentUser()?.name || '사용자',
        badge: { text: '연속', type: 'warning' },
        metadata: { streakDays: streakData }
      });
    }

    // 그룹 통계 기반 마일스톤
    if (this.groupCache) {
      const totalCompletions = this.groupCache.questSuccessNum.reduce((sum, num) => sum + num, 0);
      
      if (totalCompletions > 0 && totalCompletions % 100 < this.groupCache.questList.length) {
        const milestone = Math.floor(totalCompletions / 100) * 100;
        activities.push({
          id: 'milestone-' + milestone,
          type: 'milestone',
          title: `그룹 마일스톤 달성!`,
          description: `전체 ${milestone}회의 퀘스트 완료를 달성했습니다`,
          timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
          badge: { text: '마일스톤', type: 'info' }
        });
      }
    }

    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 8);
  }

  private isRecentActivity(timestamp: Date): boolean {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return timestamp >= sevenDaysAgo;
  }

  // === 활동 관련 유틸리티 ===
  getActivityIcon(activity: RecentActivity): string {
    const iconMap = {
      'quest_complete': '✅',
      'user_join': '👋',
      'achievement': '🏆',
      'milestone': '🎯'
    };
    return activity.avatar || iconMap[activity.type] || '📋';
  }

  getActivityBadgeClass(badgeType: string): string {
    const classMap = {
      'success': 'activity-badge success',
      'info': 'activity-badge info',
      'warning': 'activity-badge warning'
    };
    return classMap[badgeType as keyof typeof classMap] || 'activity-badge';
  }

  getTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return timestamp.toLocaleDateString();
  }

  // === 디버깅 및 관리 메서드들 (UserQuestCur 기반) ===
  getCompletedQuestIds(): string[] {
    return Array.from(this.questState().completedQuestIds);
  }

  getCompletedQuestTitles(): string[] {
    return Array.from(this.questState().completedQuestTitles);
  }

  resetQuestCompletions(): void {
    this.questState.set({
      completedQuestIds: new Set(),
      completedQuestTitles: new Set(),
      lastSyncTime: 0
    });
  }

  logUserQuestStatus(): void {
    if (this.userQuestCache && this.groupCache) {
      const groupName = this.shared.selectedGroup();
      const groupQuests = this.userQuestCache.curQuestTotalList.filter(q => q.group === groupName);
      
      console.group('=== UserQuestCur 기반 퀘스트 상태 ===');
      console.log('그룹명:', groupName);
      console.log('전체 퀘스트:', this.quests().length);
      console.log('UserQuestCur 데이터:', {
        totalQuests: this.userQuestCache.curQuestTotalList.length,
        groupQuests: groupQuests.length,
        completedInGroup: groupQuests.filter(q => q.success).length
      });
      console.log('완료된 퀘스트 (로컬):', Array.from(this.questState().completedQuestTitles));
      console.log('완료된 퀘스트 ID:', Array.from(this.questState().completedQuestIds));
      
      console.group('퀘스트별 상세 정보');
      this.quests().forEach(quest => {
        const userQuestRecord = groupQuests.find(q => q.questId.toString() === quest.id);
        console.log(`퀘스트 ${quest.id} (${quest.title}):`, {
          localStatus: quest.status,
          userQuestCompleted: userQuestRecord?.success || false,
          questId: userQuestRecord?.questId,
          completable: this.isQuestCompletable(quest),
          inCompletedTitles: this.questState().completedQuestTitles.has(quest.title),
          inCompletedIds: this.questState().completedQuestIds.has(quest.id)
        });
      });
      console.groupEnd();
      
      console.log('UserQuestCur 그룹 퀘스트:', groupQuests);
      console.groupEnd();
    }
  }

  async forceRefreshUserQuest(): Promise<void> {
    const userId = this.shared.currentUser()?.id;
    if (!userId) return;

    try {
      console.log('🔄 UserQuestCur 강제 새로고침 시작...');
      
      // 캐시 완전 삭제
      this.userService['cacheService']?.removeCache('userQuestCur');
      
      // 새로운 데이터 로드
      await this.loadUserQuestData();
      
      // 퀘스트 재처리
      this.processQuestsFromUserQuestCur();
      
      console.log('✅ UserQuestCur 강제 새로고침 완료');
    } catch (error) {
      console.error('❌ Error force refreshing UserQuestCur:', error);
    }
  }

  async syncWithServerQuest(): Promise<void> {
    try {
      console.log('🔄 서버와 동기화 시작...');
      
      const groupName = this.shared.selectedGroup();
      if (groupName) {
        // 그룹 캐시도 새로고침
        this.userService['cacheService']?.removeCache(groupName);
        await this.loadGroupData();
      }
      
      // UserQuestCur 강제 새로고침
      await this.forceRefreshUserQuest();
      
      console.log('✅ 서버와 동기화 완료');
    } catch (error) {
      console.error('❌ Error syncing with server:', error);
    }
  }

  async fullDataReset(): Promise<void> {
    try {
      console.log('🔄 전체 데이터 리셋 시작...');
      
      // 모든 로컬 상태 초기화
      this.resetQuestCompletions();
      this.groupCache = undefined;
      this.userQuestCache = null;
      this.selectedQuestIds.set(new Set());
      
      // 모든 관련 캐시 삭제
      const groupName = this.shared.selectedGroup();
      if (groupName) {
        this.userService['cacheService']?.removeCache(groupName);
      }
      this.userService['cacheService']?.removeCache('userQuestCur');
      this.userService['cacheService']?.removeCache('userStatus');
      
      // 전체 데이터 재로드
      await this.loadAllData();
      
      console.log('✅ 전체 데이터 리셋 완료');
    } catch (error) {
      console.error('❌ Error during full data reset:', error);
    }
  }

  // === 오프라인 관련 추가 메서드들 ===
  async manualSyncOfflineQuests(): Promise<void> {
    console.log('🔄 수동 오프라인 동기화 시작');
    await this.syncOfflineQuests();
  }

  getOfflineQuestCount(): number {
    const userId = this.shared.currentUser()?.id;
    const groupName = this.shared.selectedGroup();
    
    if (!userId) return 0;
    
    const stats = this.offlineQuestService.getOfflineStats(userId, groupName ? groupName : undefined);
    return stats.totalPending;
  }

  isOfflineMode(): boolean {
    const stats = this.offlineQuestService.getOfflineStats();
    return !stats.isOnline || stats.totalPending > 0;
  }

  retryFailedOfflineQuests(): void {
    const retryCount = this.offlineQuestService.retryFailedQuests();
    
    if (retryCount > 0) {
      this.showToast('success', `🔄 ${retryCount}개의 실패한 퀘스트를 재시도 대기열에 추가했습니다.`);
      setTimeout(() => this.syncOfflineQuests(), 1000);
    } else {
      this.showToast('success', '재시도할 실패한 퀘스트가 없습니다.');
    }
  }

  // === UserQuestCur 기반 퀘스트 매칭 유틸리티 ===
  
  /**
   * questId로 UserQuestCur에서 퀘스트 정보 찾기
   */
  private findUserQuestByQuestId(questId: string): any | null {
    if (!this.userQuestCache) return null;
    
    const groupName = this.shared.selectedGroup();
    if (!groupName) return null;

    return this.userQuestCache.curQuestTotalList.find(
      quest => quest.questId.toString() === questId && quest.group === groupName
    ) || null;
  }

  /**
   * 퀘스트 제목으로 UserQuestCur에서 퀘스트 정보 찾기
   */
  private findUserQuestByTitle(questTitle: string): any | null {
    if (!this.userQuestCache) return null;
    
    const groupName = this.shared.selectedGroup();
    if (!groupName) return null;

    return this.userQuestCache.curQuestTotalList.find(
      quest => quest.quest === questTitle && quest.group === groupName
    ) || null;
  }

  /**
   * UserQuestCur 데이터 검증
   */
  private validateUserQuestCur(): boolean {
    if (!this.userQuestCache) {
      console.warn('❌ UserQuestCur 데이터가 없습니다.');
      return false;
    }

    const groupName = this.shared.selectedGroup();
    if (!groupName) {
      console.warn('❌ 선택된 그룹이 없습니다.');
      return false;
    }

    const groupQuests = this.userQuestCache.curQuestTotalList.filter(
      quest => quest.group === groupName
    );

    if (groupQuests.length === 0) {
      console.warn('❌ 현재 그룹에 대한 퀘스트 데이터가 없습니다.');
      return false;
    }

    console.log('✅ UserQuestCur 데이터 검증 완료:', {
      totalQuests: this.userQuestCache.curQuestTotalList.length,
      groupQuests: groupQuests.length,
      completedQuests: groupQuests.filter(q => q.success).length
    });

    return true;
  }

  /**
   * UserQuestCur와 Group 데이터 일관성 검사
   */
  async validateDataConsistency(): Promise<{
    isConsistent: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // UserQuestCur 검증
      if (!this.validateUserQuestCur()) {
        issues.push('UserQuestCur 데이터가 유효하지 않습니다.');
        recommendations.push('forceRefreshUserQuest()를 실행하세요.');
      }

      // Group 데이터 검증
      if (!this.groupCache) {
        issues.push('Group 캐시 데이터가 없습니다.');
        recommendations.push('loadGroupData()를 실행하세요.');
      }

      // 퀘스트 매칭 검증
      if (this.userQuestCache && this.groupCache) {
        const groupName = this.shared.selectedGroup();
        const userGroupQuests = this.userQuestCache.curQuestTotalList.filter(
          quest => quest.group === groupName
        );

        const groupQuestTitles = new Set(this.groupCache.questList);
        const userQuestTitles = new Set(userGroupQuests.map(q => q.quest));

        // Group에 있지만 UserQuestCur에 없는 퀘스트
        const missingInUser = this.groupCache.questList.filter(
          title => !userQuestTitles.has(title)
        );

        // UserQuestCur에 있지만 Group에 없는 퀘스트
        const extraInUser = userGroupQuests.filter(
          quest => !groupQuestTitles.has(quest.quest)
        );

        if (missingInUser.length > 0) {
          issues.push(`UserQuestCur에 누락된 퀘스트: ${missingInUser.join(', ')}`);
          recommendations.push('서버에서 최신 사용자 퀘스트 데이터를 다시 로드하세요.');
        }

        if (extraInUser.length > 0) {
          issues.push(`Group에 없는 사용자 퀘스트: ${extraInUser.map(q => q.quest).join(', ')}`);
          recommendations.push('Group 데이터를 새로고침하거나 사용자 퀘스트 데이터를 동기화하세요.');
        }
      }

      const isConsistent = issues.length === 0;

      console.log(isConsistent ? '✅ 데이터 일관성 검사 통과' : '❌ 데이터 일관성 문제 발견');

      return {
        isConsistent,
        issues,
        recommendations
      };

    } catch (error) {
      console.error('데이터 일관성 검사 중 오류:', error);
      return {
        isConsistent: false,
        issues: ['데이터 일관성 검사 중 오류가 발생했습니다.'],
        recommendations: ['fullDataReset()을 실행하여 전체 데이터를 다시 로드하세요.']
      };
    }
  }

  /**
   * 데이터 일관성 검사 및 자동 수정
   */
  async autoFixDataInconsistency(): Promise<boolean> {
    try {
      const validation = await this.validateDataConsistency();
      
      if (validation.isConsistent) {
        console.log('✅ 데이터가 일관성 있음, 수정할 필요 없음');
        return true;
      }

      console.log('🔧 데이터 불일치 감지, 자동 수정 시작...');
      console.log('문제점:', validation.issues);

      // 자동 수정 시도
      await this.fullDataReset();
      
      // 수정 후 재검증
      const revalidation = await this.validateDataConsistency();
      
      if (revalidation.isConsistent) {
        console.log('✅ 데이터 불일치 자동 수정 완료');
        this.showToast('success', '데이터 불일치가 자동으로 수정되었습니다.');
        return true;
      } else {
        console.log('❌ 자동 수정 실패, 수동 개입 필요');
        this.showToast('error', '데이터 불일치 자동 수정에 실패했습니다.');
        return false;
      }

    } catch (error) {
      console.error('자동 수정 중 오류:', error);
      return false;
    }
  }

  public isQuestCompletedForTemplate(quest: Quest): boolean {
    return this.isQuestCompletedByQuestId(quest.id);
  }

  public canSelectQuest(quest: Quest): boolean {
    return this.isQuestCompletable(quest);
  }

  public getQuestStatusClass(quest: Quest): string {
    if (this.isQuestCompletedByQuestId(quest.id)) {
      return 'quest-completed';
    }
    if (this.isQuestSelected(quest.id)) {
      return 'quest-selected';
    }
    if (!this.isQuestCompletable(quest)) {
      return 'quest-disabled';
    }
    return 'quest-available';
  }
}