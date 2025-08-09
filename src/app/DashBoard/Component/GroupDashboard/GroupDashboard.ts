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

  // 최근 활동 데이터
  recentActivities = signal<RecentActivity[]>([]);

  // 활동 통계를 위한 computed signals
  readonly recentQuestCompletions = computed(() => 
    this.recentActivities().filter(a => a.type === 'quest_complete').length
  );
  
  readonly currentStreak = computed(() => 
    this.activityService.getCurrentStreak()
  );
  
  readonly recentNewMembers = computed(() => 
    this.recentActivities().filter(a => a.type === 'user_join').length
  );

  // 상태 signals
  readonly isLoading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  
  // 피드백 관련 signals (좋아요/싫어요 + 텍스트)
  readonly showFeedback = signal<boolean>(false);
  readonly feedbackData = signal<FloatingFeedbackData | null>(null);
  readonly feedbackText = signal<string>('');
  readonly feedbackLike = signal<boolean | null>(null); // true=좋아요, false=싫어요, null=미선택
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

  // 피드백 유효성 검사 (좋아요/싫어요 선택 + 텍스트)
  readonly isFeedbackValid = computed(() => {
    const hasLikeSelection = this.feedbackLike() !== null;
    const text = this.feedbackText()?.trim() || '';
    const hasValidText = text.length >= 5 && text.length <= 200;
    return hasLikeSelection && hasValidText;
  });

  // 안전한 접근자들
  readonly feedbackTextLength = computed(() => 
    this.feedbackText()?.length || 0
  );

  readonly feedbackDataTitle = computed(() => 
    this.feedbackData()?.questTitle || ''
  );

  constructor(
    private groupDashboardService: GroupDashboardService,
    private shared: SharedStateService,
    private router: Router,
    private userService: UserService,
    public activityService: LocalActivityService, // public으로 변경
    private feedbackService: QuestFeedbackService,
    private dialog: MatDialog
  ) {
    this.monitorQuestChanges();
  }

  async ngOnInit(): Promise<void> {
    console.log("GroupDashboard initialized");
    await this.ensureGroupSelected();
    await this.loadGroupData();
    await this.loadRecentActivities();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // === 최근 활동 데이터 로딩 (새로 추가) ===
  
  private async loadRecentActivities(): Promise<void> {
    try {
      const groupName = this.shared.selectedGroup();
      if (!groupName) return;

      const activities: RecentActivity[] = [];

      // 1. 로컬 활동 서비스에서 최근 퀘스트 완료 기록 가져오기
      const localActivities = this.activityService.activities();
      const recentQuestCompletions = localActivities
        .filter(activity => 
          activity.type === 'quest_complete' && 
          activity.context?.groupName === groupName &&
          this.isRecentActivity(activity.timestamp)
        )
        .slice(0, 5);

      recentQuestCompletions.forEach(activity => {
        activities.push({
          id: activity.id,
          type: 'quest_complete',
          title: `${activity.context?.questName || '퀘스트'} 완료`,
          description: `${activity.title}를 성공적으로 완료했습니다`,
          timestamp: activity.timestamp,
          user: this.shared.currentUser()?.name || '사용자',
          avatar: '🎯',
          badge: {
            text: '완료',
            type: 'success'
          },
          metadata: {
            questTitle: activity.context?.questName
          }
        });
      });

      // 2. 연속 퀘스트 달성 기록
      const streakData = this.activityService.getCurrentStreak();
      if (streakData >= 3) {
        activities.push({
          id: 'streak-' + Date.now(),
          type: 'achievement',
          title: `${streakData}일 연속 활동!`,
          description: '꾸준한 노력이 빛을 발하고 있습니다',
          timestamp: new Date(),
          user: this.shared.currentUser()?.name || '사용자',
          avatar: '🔥',
          badge: {
            text: '연속',
            type: 'warning'
          },
          metadata: {
            streakDays: streakData
          }
        });
      }

      // 3. 그룹 통계 기반 마일스톤
      if (this.groupCache) {
        const totalCompletions = this.groupCache.questSuccessNum.reduce((sum, num) => sum + num, 0);
        
        // 100단위 마일스톤 체크
        if (totalCompletions > 0 && totalCompletions % 100 < this.groupCache.questList.length) {
          const milestone = Math.floor(totalCompletions / 100) * 100;
          activities.push({
            id: 'milestone-' + milestone,
            type: 'milestone',
            title: `그룹 마일스톤 달성!`,
            description: `전체 ${milestone}회의 퀘스트 완료를 달성했습니다`,
            timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000), // 최근 24시간 내 랜덤
            avatar: '🏆',
            badge: {
              text: '마일스톤',
              type: 'info'
            }
          });
        }
      }

      // 4. 사용자 참여 기반 활동
      const joinActivities = localActivities
        .filter(activity => activity.type === 'group_join' && this.isRecentActivity(activity.timestamp))
        .slice(0, 2);

      joinActivities.forEach(activity => {
        activities.push({
          id: activity.id,
          type: 'user_join',
          title: '새로운 멤버 합류',
          description: `${activity.context?.groupName || groupName} 그룹에 새로운 멤버가 합류했습니다`,
          timestamp: activity.timestamp,
          avatar: '👋',
          badge: {
            text: '참여',
            type: 'info'
          }
        });
      });

      // 시간순 정렬 및 최대 8개로 제한
      const sortedActivities = activities
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 8);

      this.recentActivities.set(sortedActivities);

    } catch (error) {
      console.error('Error loading recent activities:', error);
      this.recentActivities.set([]);
    }
  }

  private isRecentActivity(timestamp: Date): boolean {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return timestamp >= sevenDaysAgo;
  }

  // === 좋아요/싫어요 + 텍스트 피드백 시스템 ===

  private showFloatingFeedback(quest: Quest, groupName: string, clubName: string): void {
    const feedbackData: FloatingFeedbackData = {
      questId: quest.id,
      questTitle: quest.title,
      groupName,
      clubName,
      visible: true
    };

    this.feedbackData.set(feedbackData);
    this.feedbackText.set('');
    this.feedbackLike.set(null); // 초기화
    this.showFeedback.set(true);

    console.log('Showing floating feedback for quest:', quest.title);
  }

  setFeedbackText(text: string): void {
    this.feedbackText.set(text);
  }

  // 이벤트 핸들러 (타입 안전)
  onFeedbackTextChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    if (target) {
      this.setFeedbackText(target.value);
    }
  }

  setFeedbackLike(isLike: boolean): void {
    this.feedbackLike.set(isLike);
  }

  async submitFeedback(): Promise<void> {
    const data = this.feedbackData();
    const text = this.feedbackText()?.trim() || '';
    const isLike = this.feedbackLike();
    const userId = this.shared.currentUser()?.id;

    if (!data || !this.isFeedbackValid() || !userId || isLike === null) {
      console.warn('Invalid feedback data:', { 
        hasData: !!data, 
        isValid: this.isFeedbackValid(), 
        hasUser: !!userId, 
        hasLikeSelection: isLike !== null 
      });
      return;
    }

    this.isSubmittingFeedback.set(true);

    try {
      // 안전한 타입으로 피드백 생성
      const feedbackData = {
        quest: data.questTitle || '',
        group: data.groupName || '',
        club: data.clubName || '',
        user: userId,
        feedbackScore: isLike ? 1 : 0,
        feedbackText: text,
        isLike: isLike,
        metadata: {
          submissionMethod: 'like_text' as const,
          isLike: isLike,
          sentiment: isLike ? 'positive' as const : 'negative' as const,
          source: 'dashboard',
          version: '2.0'
        }
      };

      // QuestFeedback 타입으로 변환하여 저장
      const feedback = feedbackData as Omit<QuestFeedback, 'id' | 'createTime'>;
      const feedbackId = this.feedbackService.saveFeedback(feedback);
      
      if (!feedbackId) {
        throw new Error('Failed to save feedback');
      }

      // questSuccess 함수 호출
      const success = await this.groupDashboardService.questSuccessWithFeedback(
        data.groupName || '',
        userId,
        [data.questTitle || ''],
        text,
        isLike
      );

      if (success) {
        console.log('Quest completion with like/dislike feedback sent successfully');
        this.closeFeedback();
        this.showFeedbackSuccessToast(isLike);
        await this.loadRecentActivities();
      } else {
        throw new Error('Failed to submit quest success with feedback');
      }

    } catch (error) {
      console.error('Error submitting feedback:', error);
      this.showErrorToast('피드백 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      this.isSubmittingFeedback.set(false);
    }
  }

  closeFeedback(): void {
    this.showFeedback.set(false);
    this.feedbackData.set(null);
    this.feedbackText.set('');
    this.feedbackLike.set(null);
  }

  // === 최근 활동 관련 유틸리티 메서드 ===

  getActivityIcon(activity: RecentActivity): string {
    const iconMap = {
      'quest_complete': '✅',
      'user_join': '👋',
      'achievement': '🏆',
      'milestone': '🎯'
    };
    return activity.avatar || iconMap[activity.type] || '📝';
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

  // === 기존 메서드들 유지 (UserQuestCur 관련) ===

  private isQuestCompletedInUserQuest(questTitle: string): boolean {
    if (!this.userQuestCache || !this.groupCache) return false;
    
    const userId = this.shared.currentUser()?.id;
    const groupName = this.shared.selectedGroup();
    if (!userId || !groupName) return false;

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
      let userQuestCur = await this.userService.getUserQuestCur(userId);
      
      if (!userQuestCur) {
        console.warn('No UserQuestCur data found');
        return;
      }

      const needsUpdate = await this.checkQuestCreateTimeSync(userQuestCur);
      
      if (needsUpdate) {
        console.log('Quest data is outdated, refreshing UserQuestCur...');
        this.userService['cacheService']?.removeCache('userQuestCur');
        userQuestCur = await this.userService.getUserQuestCur(userId);
      }

      this.userQuestCache = userQuestCur;
      
    } catch (error) {
      console.error('Error synchronizing UserQuestCur:', error);
    }
  }

  private async checkQuestCreateTimeSync(userQuestCur: UserQuestCur): Promise<boolean> {
    if (!this.groupCache) return false;

    try {
      const groupQuestCreateTime = new Date(this.groupCache.questCreateTime);
      const cacheExpiry = this.userService['cacheService']?.getCacheExpiry('userQuestCur');
      
      if (!cacheExpiry) return true;

      const cacheTime = new Date(cacheExpiry - (45 * 60 * 1000));
      const needsUpdate = groupQuestCreateTime > cacheTime;
      
      return needsUpdate;

    } catch (error) {
      console.error('Error checking quest create time sync:', error);
      return true;
    }
  }

  private async updateUserQuestCompletion(questTitle: string, isCompleted: boolean): Promise<void> {
    if (!this.userQuestCache) return;

    const userId = this.shared.currentUser()?.id;
    const groupName = this.shared.selectedGroup();
    
    if (!userId || !groupName) return;

    try {
      this.userQuestCache.curQuestTotalList = this.userQuestCache.curQuestTotalList.map(quest => {
        if (quest.quest === questTitle && quest.group === groupName) {
          return { ...quest, isSuccess: isCompleted };
        }
        return quest;
      });

      if (isCompleted) {
        const success = await this.userService.setUserQuestRecord(userId, groupName, [questTitle]);
        
        if (success) {
          console.log(`Quest completion updated: ${questTitle}`);
          await this.updateGroupCacheQuestSuccess(questTitle);
        } else {
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
      this.groupCache.questSuccessNum[questIndex] = (this.groupCache.questSuccessNum[questIndex] || 0) + 1;
      this.userService['cacheService']?.setCache(this.groupCache.name, this.groupCache);
      
    } catch (error) {
      console.error('Error updating group cache:', error);
    }
  }

  // === 퀘스트 변화 모니터링 및 완료 처리 ===
  
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
        await this.updateUserQuestCompletion(quest.title, true);
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
        this.showFloatingFeedback(quest, groupName, channelName);

      } catch (error) {
        console.error('Error handling quest completion:', quest.title, error);
      }
    }
  }

  // === 나머지 기존 메서드들 (생략 - 동일하게 유지) ===
  
  // 데이터 로딩, 퀘스트 관련, UI 관련 메서드들은 동일하게 유지...
  
  private async loadGroupData(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const selectedGroup = this.shared.selectedGroup();
      
      if (!selectedGroup) {
        throw new Error('선택된 그룹이 없습니다.');
      }

      const [group, userQuestCur] = await Promise.allSettled([
        this.groupDashboardService.getGroupData(selectedGroup),
        this.loadUserQuestData()
      ]);

      if (group.status === 'fulfilled' && group.value) {
        this.groupCache = group.value;
        this.title.set(group.value.name);
      } else {
        throw new Error('그룹 데이터를 찾을 수 없습니다.');
      }

      if (userQuestCur.status === 'fulfilled') {
        this.userQuestCache = userQuestCur.value;
      }

      await this.ensureUserQuestCurSync();

      const newQuests = this.groupDashboardService.processingQuest(this.groupCache);
      const questsWithStatus = this.applyUserQuestStatus(newQuests);

      this.quests.set(questsWithStatus);
      this.stats.set(this.groupDashboardService.processingStat(this.groupCache));

      this.completedQuestIds.clear();
      questsWithStatus.forEach(quest => {
        if (quest.status === 'completed' || this.isQuestCompletedInUserQuest(quest.title)) {
          this.completedQuestIds.add(quest.id);
        }
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

  // 퀘스트 관련 메서드들...
  onQuestClick(quest: Quest): void {
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

  isQuestCompletable(quest: Quest): boolean {
    return !this.isQuestCompletedInUserQuest(quest.title) && quest.status !== 'completed';
  }

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
      await this.updateUserQuestCompletion(questToComplete.title, true);

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
      
      this.selectedQuestIds.update(selected => {
        const newSelected = new Set(selected);
        newSelected.delete(questId);
        return newSelected;
      });
      
      this.updateStats();
      
    } catch (error) {
      console.error('Failed to complete quest:', questId, error);
      this.showErrorToast('퀘스트 완료 처리에 실패했습니다.');
    }
  }

  // 유틸리티 메서드들...
  private async ensureGroupSelected(): Promise<void> {
    let selectedGroup = this.shared.selectedGroup();
    
    if (!selectedGroup) {
      const joinedGroups = await this.getJoinedGroups();
      if (joinedGroups.length > 0) {
        const firstGroup = joinedGroups[0];
        this.shared.setSelectedGroup(firstGroup);
      } else {
        this.navigateToGroupJoin();
        return;
      }
    }
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
    this.loadRecentActivities();
  }

  private showFeedbackSuccessToast(isLike?: boolean): void {
    const toast = document.createElement('div');
    toast.className = 'feedback-success-toast';
    
    const likeText = isLike !== undefined 
      ? (isLike ? ' 👍 좋은 피드백 감사합니다!' : ' 👎 소중한 의견 감사합니다!')
      : '';
    
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">✨</div>
        <div class="toast-message">피드백이 저장되었습니다!${likeText}</div>
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
    }, 3000); // 좋아요/싫어요 메시지는 조금 더 오래 표시
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

  // === 디버깅 메서드들 ===

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
      
      this.userService['cacheService']?.removeCache('userQuestCur');
      this.userQuestCache = await this.userService.getUserQuestCur(userId);
      
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
      const groupName = this.shared.selectedGroup();
      if (groupName) {
        this.userService['cacheService']?.removeCache(groupName);
        this.groupCache = await this.groupDashboardService.getGroupData(groupName);
      }
      
      await this.forceRefreshUserQuest();
      await this.ensureUserQuestCurSync();
      
      console.log('Server sync completed');
    } catch (error) {
      console.error('Error syncing with server:', error);
    }
  }
}