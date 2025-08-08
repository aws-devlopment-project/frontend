import { Component, signal, OnInit, OnDestroy, effect, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule, MatDialog } from "@angular/material/dialog";
import { Router } from "@angular/router";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";

import { GroupDashboardService } from "../../Service/GroupDashboard";
import { Quest, Stat } from "../../Models/GroupDashboardModels";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { UserService } from "../../../Core/Service/UserService";
import { LocalActivityService } from "../../Service/LocalActivityService";
import { QuestFeedbackService, QuestFeedback } from "../../Service/QuestFeedbackSystem";
import { Group } from "../../../Core/Models/group";
import { UserQuestCur } from "../../../Core/Models/user";

interface QuestCompletionEvent {
  questId: string;
  questTitle: string;
  groupName: string;
  channelName: string;
  userId: string;
  completedAt: Date;
}

interface FloatingFeedbackData {
  questId: string;
  questTitle: string;
  groupName: string;
  clubName: string;
  visible: boolean;
}

@Component({
  selector: 'app-group-dashboard',
  templateUrl: './GroupDashboard.html',
  styleUrl: './GroupDashboard.css',
  imports: [CommonModule, MatIconModule, MatButtonModule, MatDialogModule],
  providers: [GroupDashboardService],
  standalone: true
})
export class GroupDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private completedQuestIds = new Set<string>();
  private groupCache: Group | undefined = undefined;
  private userQuestCache: UserQuestCur | null = null;

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
  
  // 피드백 관련 signals
  readonly showFeedback = signal<boolean>(false);
  readonly feedbackData = signal<FloatingFeedbackData | null>(null);
  readonly feedbackScore = signal<number>(0);
  readonly isSubmittingFeedback = signal<boolean>(false);

  // 퀘스트 완료 확인 모달 관련
  readonly showConfirmModal = signal<boolean>(false);
  readonly confirmModalData = signal<{
    questNames: string[];
    questCount: number;
  } | null>(null);

  // Computed signals
  readonly hasCompletedQuests = computed(() => {
    return this.quests().some(quest => this.isQuestCompletedInUserQuest(quest.title));
  });

  readonly availableQuestsForSelection = computed(() => {
    return this.quests().filter(quest => 
      !this.isQuestCompletedInUserQuest(quest.title) && 
      quest.status !== 'completed'
    );
  });

  constructor(
    private groupDashboardService: GroupDashboardService,
    private shared: SharedStateService,
    private router: Router,
    private userService: UserService,
    private activityService: LocalActivityService,
    private feedbackService: QuestFeedbackService,
    private dialog: MatDialog
  ) {
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

  // === UserQuestCur 기반 퀘스트 완료 상태 확인 ===

  private isQuestCompletedInUserQuest(questTitle: string): boolean {
    if (!this.userQuestCache || !this.groupCache) return false;
    
    const userId = this.shared.currentUser()?.id;
    const groupName = this.shared.selectedGroup();
    if (!userId || !groupName) return false;

    // userQuestCur에서 해당 퀘스트 찾기
    const questRecord = this.userQuestCache.curQuestTotalList.find(
      quest => quest.quest === questTitle && quest.group === groupName
    );

    return questRecord?.isSuccess || false;
  }

  private async ensureUserQuestCurSync(): Promise<void> {
    const userId = this.shared.currentUser()?.id;
    const groupName = this.shared.selectedGroup();
    
    if (!userId || !groupName || !this.groupCache) return;

    try {
      // 현재 캐시된 UserQuestCur 조회
      let userQuestCur = await this.userService.getUserQuestCur(userId);
      
      if (!userQuestCur) {
        console.warn('No UserQuestCur data found');
        return;
      }

      // questCreateTime과 비교하여 업데이트 필요 여부 확인
      const needsUpdate = await this.checkQuestCreateTimeSync(userQuestCur);
      
      if (needsUpdate) {
        console.log('Quest data is outdated, refreshing UserQuestCur...');
        
        // 캐시 무효화 후 재조회
        this.userService['cacheService']?.removeCache('userQuestCur');
        userQuestCur = await this.userService.getUserQuestCur(userId);
      }

      this.userQuestCache = userQuestCur;
      
      console.log('UserQuestCur synchronized:', {
        totalQuests: userQuestCur?.curQuestTotalList.length || 0,
        completedQuests: userQuestCur?.curQuestTotalList.filter(q => q.isSuccess).length || 0,
        groupQuests: userQuestCur?.curQuestTotalList.filter(q => q.group === groupName).length || 0
      });

    } catch (error) {
      console.error('Error synchronizing UserQuestCur:', error);
    }
  }

  private async checkQuestCreateTimeSync(userQuestCur: UserQuestCur): Promise<boolean> {
    if (!this.groupCache) return false;

    try {
      // Group의 questCreateTime과 UserQuestCur의 데이터 시간 비교
      const groupQuestCreateTime = new Date(this.groupCache.questCreateTime);
      
      // UserQuestCur에 타임스탬프가 없으므로 캐시 만료 시간을 확인
      const cacheExpiry = this.userService['cacheService']?.getCacheExpiry('userQuestCur');
      
      if (!cacheExpiry) {
        // 캐시 만료 시간을 알 수 없으면 업데이트 필요
        return true;
      }

      const cacheTime = new Date(cacheExpiry - (45 * 60 * 1000)); // TTL에서 생성 시간 역산
      
      // questCreateTime이 캐시 생성 시간보다 최신이면 업데이트 필요
      const needsUpdate = groupQuestCreateTime > cacheTime;
      
      console.log('Quest time sync check:', {
        groupQuestCreateTime: groupQuestCreateTime.toISOString(),
        cacheTime: cacheTime.toISOString(),
        needsUpdate
      });

      return needsUpdate;

    } catch (error) {
      console.error('Error checking quest create time sync:', error);
      // 에러 발생 시 안전하게 업데이트 수행
      return true;
    }
  }

  private async updateUserQuestCompletion(questTitle: string, isCompleted: boolean): Promise<void> {
    if (!this.userQuestCache) return;

    const userId = this.shared.currentUser()?.id;
    const groupName = this.shared.selectedGroup();
    
    if (!userId || !groupName) return;

    try {
      // 로컬 캐시 업데이트
      this.userQuestCache.curQuestTotalList = this.userQuestCache.curQuestTotalList.map(quest => {
        if (quest.quest === questTitle && quest.group === groupName) {
          return { ...quest, isSuccess: isCompleted };
        }
        return quest;
      });

      // 서버에 업데이트 (이미 완료된 퀘스트만)
      if (isCompleted) {
        const success = await this.userService.setUserQuestRecord(userId, groupName, [questTitle]);
        
        if (success) {
          console.log(`Quest completion updated: ${questTitle}`);
          
          // 그룹 캐시도 업데이트
          await this.updateGroupCacheQuestSuccess(questTitle);
        } else {
          // 서버 업데이트 실패 시 로컬 캐시 롤백
          this.userQuestCache.curQuestTotalList = this.userQuestCache.curQuestTotalList.map(quest => {
            if (quest.quest === questTitle && quest.group === groupName) {
              return { ...quest, isSuccess: false };
            }
            return quest;
          });
          throw new Error('Failed to update quest completion on server');
        }
      }

    } catch (error) {
      console.error('Error updating quest completion:', error);
      throw error;
    }
  }

  private async updateGroupCacheQuestSuccess(questTitle: string): Promise<void> {
    if (!this.groupCache) return;

    const questIndex = this.groupCache.questList.findIndex(quest => quest === questTitle);
    if (questIndex === -1) return;

    try {
      // 그룹 캐시의 성공 카운트 증가
      this.groupCache.questSuccessNum[questIndex] = (this.groupCache.questSuccessNum[questIndex] || 0) + 1;
      
      // 캐시 업데이트
      this.userService['cacheService']?.setCache(this.groupCache.name, this.groupCache);
      
      console.log(`Group cache updated: ${questTitle} success count incremented`);

    } catch (error) {
      console.error('Error updating group cache:', error);
    }
  }

  // === 퀘스트 변화 모니터링 (개선됨) ===
  
  private monitorQuestChanges(): void {
    effect(() => {
      const currentQuests = this.quests();
      const completedQuests = currentQuests.filter(quest => quest.status === 'completed');
      
      const newlyCompleted = completedQuests.filter(quest => 
        !this.completedQuestIds.has(quest.id)
      );

      if (newlyCompleted.length > 0) {
        console.log('New quest completions detected:', newlyCompleted.length);
        this.handleQuestCompletions(newlyCompleted);
        
        newlyCompleted.forEach(quest => {
          this.completedQuestIds.add(quest.id);
        });
      }
    });
  }

  private async handleQuestCompletions(completedQuests: Quest[]): Promise<void> {
    const groupName = this.shared.selectedGroup();
    const channelName = this.shared.selectedChannel() || 'general';
    const userId = this.shared.currentUser()?.id;

    if (!groupName || !userId) {
      console.warn('Missing group or user information for quest completion');
      return;
    }

    for (const quest of completedQuests) {
      try {
        // UserQuestCur 업데이트
        await this.updateUserQuestCompletion(quest.title, true);
        
        // 활동 추적
        await this.activityService.trackQuestCompletion(groupName, [quest.title]);

        const completionEvent: QuestCompletionEvent = {
          questId: quest.id,
          questTitle: quest.title,
          groupName,
          channelName,
          userId,
          completedAt: new Date()
        };

        console.log('Quest completion event:', completionEvent);

        // 플로팅 피드백 UI 표시
        this.showFloatingFeedback(quest, groupName, channelName);

      } catch (error) {
        console.error('Error handling quest completion:', quest.title, error);
      }
    }
  }

  // === 데이터 로딩 (개선됨) ===

  private async loadGroupData(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const selectedGroup = this.shared.selectedGroup();
      
      if (!selectedGroup) {
        throw new Error('선택된 그룹이 없습니다.');
      }

      console.log('그룹 데이터 로딩 시작:', selectedGroup);

      // 병렬로 그룹 데이터와 사용자 퀘스트 데이터 로드
      const [group, userQuestCur] = await Promise.allSettled([
        this.groupDashboardService.getGroupData(selectedGroup),
        this.loadUserQuestData()
      ]);

      // 그룹 데이터 처리
      if (group.status === 'fulfilled' && group.value) {
        this.groupCache = group.value;
        this.title.set(group.value.name);
      } else {
        throw new Error('그룹 데이터를 찾을 수 없습니다.');
      }

      // 사용자 퀘스트 데이터 처리
      if (userQuestCur.status === 'fulfilled') {
        this.userQuestCache = userQuestCur.value;
      } else {
        console.warn('UserQuestCur data not available');
      }

      // UserQuestCur 동기화 확인
      await this.ensureUserQuestCurSync();

      // 퀘스트 데이터 생성 및 완료 상태 적용
      const newQuests = this.groupDashboardService.processingQuest(this.groupCache);
      const questsWithStatus = this.applyUserQuestStatus(newQuests);

      this.quests.set(questsWithStatus);
      this.stats.set(this.groupDashboardService.processingStat(this.groupCache));

      // 완료된 퀘스트 ID 설정
      this.completedQuestIds.clear();
      questsWithStatus.forEach(quest => {
        if (quest.status === 'completed' || this.isQuestCompletedInUserQuest(quest.title)) {
          this.completedQuestIds.add(quest.id);
        }
      });

      console.log('그룹 데이터 로딩 완료:', {
        title: this.title(),
        questsCount: this.quests().length,
        completedQuests: Array.from(this.completedQuestIds),
        userQuestRecords: this.userQuestCache?.curQuestTotalList.length || 0
      });

      setTimeout(() => this.animateProgress(), 500);

    } catch (error) {
      console.error('그룹 데이터 로딩 실패:', error);
      this.error.set(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadUserQuestData(): Promise<UserQuestCur | null> {
    const userId = this.shared.currentUser()?.id;
    if (!userId) return null;

    try {
      return await this.userService.getUserQuestCur(userId);
    } catch (error) {
      console.error('Error loading user quest data:', error);
      return null;
    }
  }

  private applyUserQuestStatus(quests: Quest[]): Quest[] {
    return quests.map(quest => {
      const isCompleted = this.isQuestCompletedInUserQuest(quest.title);
      
      if (isCompleted) {
        return {
          ...quest,
          status: 'completed' as const,
          progress: 100
        };
      }
      
      return quest;
    });
  }

  // === 퀘스트 관련 메서드 (개선됨) ===
  
  onQuestClick(quest: Quest): void {
    // UserQuestCur에서 완료된 퀘스트는 클릭 불가
    if (this.isQuestCompletedInUserQuest(quest.title) || quest.status === 'completed') {
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

  // 퀘스트 완료 가능 여부 확인 (개선됨)
  isQuestCompletable(quest: Quest): boolean {
    return !this.isQuestCompletedInUserQuest(quest.title) && quest.status !== 'completed';
  }

  // UserQuestCur 기반 완료 상태 확인 (템플릿용)
  isQuestCompletedInCache(questId: string): boolean {
    const quest = this.quests().find(q => q.id === questId);
    return quest ? this.isQuestCompletedInUserQuest(quest.title) : false;
  }

  onQuestAction(): void {
    const selectedIds = Array.from(this.selectedQuestIds());
    const selectedQuests = this.availableQuestsForSelection()
      .filter(quest => selectedIds.includes(quest.id));
    
    if (selectedQuests.length === 0) {
      this.showErrorToast('완료할 퀘스트를 선택해주세요.');
      return;
    }

    // 모달 데이터 설정
    this.confirmModalData.set({
      questNames: selectedQuests.map(q => q.title),
      questCount: selectedQuests.length
    });
    
    this.showConfirmModal.set(true);
  }

  confirmQuestCompletion(): void {
    const selectedIds = Array.from(this.selectedQuestIds());
    const selectedQuests = this.availableQuestsForSelection()
      .filter(quest => selectedIds.includes(quest.id));

    this.showConfirmModal.set(false);
    this.confirmModalData.set(null);

    if (selectedQuests.length === 0) return;

    // 선택된 퀘스트들을 순차적으로 완료 처리
    selectedQuests.forEach((quest, index) => {
      setTimeout(() => {
        this.completeQuest(quest.id);
      }, index * 300);
    });
  }

  cancelQuestCompletion(): void {
    this.showConfirmModal.set(false);
    this.confirmModalData.set(null);
  }

  private async completeQuest(questId: string): Promise<void> {
    const currentQuests = this.quests();
    const questToComplete = currentQuests.find(q => q.id === questId);
    
    if (!questToComplete) {
      console.error('Quest not found:', questId);
      return;
    }

    // UserQuestCur에서 이미 완료된 퀘스트인지 확인
    if (this.isQuestCompletedInUserQuest(questToComplete.title)) {
      console.log('Quest already completed in UserQuestCur:', questId);
      this.selectedQuestIds.update(selected => {
        const newSelected = new Set(selected);
        newSelected.delete(questId);
        return newSelected;
      });
      return;
    }

    try {
      // UserQuestCur 업데이트
      await this.updateUserQuestCompletion(questToComplete.title, true);

      // 로컬 퀘스트 상태 업데이트
      const updatedQuests = currentQuests.map(quest => {
        if (quest.id === questId) {
          return {
            ...quest,
            status: 'completed' as const,
            progress: 100
          };
        }
        return quest;
      });

      this.quests.set(updatedQuests);
      
      // 선택 목록에서 제거
      this.selectedQuestIds.update(selected => {
        const newSelected = new Set(selected);
        newSelected.delete(questId);
        return newSelected;
      });
      
      this.updateStats();
      
      console.log(`Quest ${questId} completed and synchronized!`);

    } catch (error) {
      console.error('Failed to complete quest:', questId, error);
      this.showErrorToast('퀘스트 완료 처리에 실패했습니다.');
    }
  }

  // === 플로팅 피드백 시스템 (기존 유지) ===

  private showFloatingFeedback(quest: Quest, groupName: string, clubName: string): void {
    const feedbackData: FloatingFeedbackData = {
      questId: quest.id,
      questTitle: quest.title,
      groupName,
      clubName,
      visible: true
    };

    this.feedbackData.set(feedbackData);
    this.feedbackScore.set(0);
    this.showFeedback.set(true);

    console.log('Showing floating feedback for quest:', quest.title);
  }

  setFeedbackScore(score: number): void {
    this.feedbackScore.set(score);
  }

  async submitFeedback(): Promise<void> {
    const data = this.feedbackData();
    const score = this.feedbackScore();
    const userId = this.shared.currentUser()?.id;

    if (!data || !score || !userId) {
      console.warn('Invalid feedback data');
      return;
    }

    this.isSubmittingFeedback.set(true);

    try {
      const feedback: Omit<QuestFeedback, 'id' | 'createTime'> = {
        quest: data.questTitle,
        group: data.groupName,
        club: data.clubName,
        user: userId,
        feedbackScore: score
      };

      const feedbackId = this.feedbackService.saveFeedback(feedback);
      
      if (feedbackId) {
        console.log('Feedback saved successfully:', feedbackId);
        this.closeFeedback();
        this.showFeedbackSuccessToast();
      } else {
        throw new Error('Failed to save feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('피드백 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      this.isSubmittingFeedback.set(false);
    }
  }

  closeFeedback(): void {
    this.showFeedback.set(false);
    this.feedbackData.set(null);
    this.feedbackScore.set(0);
  }

  private showFeedbackSuccessToast(): void {
    const toast = document.createElement('div');
    toast.className = 'feedback-success-toast';
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">✨</div>
        <div class="toast-message">피드백이 저장되었습니다!</div>
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
    }, 2000);
  }

  private showErrorToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">⚠️</div>
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

  // === 기존 메서드들 유지 ===

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
    const completedQuests = this.quests().filter(q => 
      q.status === 'completed' || this.isQuestCompletedInUserQuest(q.title)
    ).length;
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

  logUserQuestStatus(): void {
    console.group('=== UserQuest Status ===');
    console.log('UserQuestCur Cache:', this.userQuestCache);
    console.log('Group Cache:', this.groupCache);
    console.log('Completed Quest IDs:', Array.from(this.completedQuestIds));
    
    if (this.userQuestCache && this.groupCache) {
      const groupName = this.shared.selectedGroup();
      const groupQuests = this.userQuestCache.curQuestTotalList.filter(q => q.group === groupName);
      
      console.log('Current Group Quests in UserQuestCur:', groupQuests);
      console.log('Group Quest List:', this.groupCache.questList);
      
      this.quests().forEach(quest => {
        console.log(`Quest ${quest.id} (${quest.title}):`, {
          localStatus: quest.status,
          userQuestCompleted: this.isQuestCompletedInUserQuest(quest.title),
          completable: this.isQuestCompletable(quest)
        });
      });
    }
    
    console.groupEnd();
  }

  async forceRefreshUserQuest(): Promise<void> {
    const userId = this.shared.currentUser()?.id;
    if (!userId) return;

    try {
      console.log('Force refreshing UserQuestCur...');
      
      // 캐시 무효화
      this.userService['cacheService']?.removeCache('userQuestCur');
      
      // 새로 조회
      this.userQuestCache = await this.userService.getUserQuestCur(userId);
      
      // 퀘스트 상태 재적용
      if (this.groupCache) {
        const newQuests = this.groupDashboardService.processingQuest(this.groupCache);
        const questsWithStatus = this.applyUserQuestStatus(newQuests);
        this.quests.set(questsWithStatus);
      }
      
      console.log('UserQuestCur refreshed successfully');
    } catch (error) {
      console.error('Error force refreshing UserQuestCur:', error);
    }
  }

  async syncWithServerQuest(): Promise<void> {
    console.log('Syncing quest data with server...');
    
    try {
      // 그룹 데이터 새로고침
      const groupName = this.shared.selectedGroup();
      if (groupName) {
        this.userService['cacheService']?.removeCache(groupName);
        this.groupCache = await this.groupDashboardService.getGroupData(groupName);
      }
      
      // UserQuestCur 새로고침
      await this.forceRefreshUserQuest();
      
      // UserQuestCur 동기화 재확인
      await this.ensureUserQuestCurSync();
      
      console.log('Server sync completed');
    } catch (error) {
      console.error('Error syncing with server:', error);
    }
  }
}