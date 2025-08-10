// HomeDashboard.ts - 퀘스트 캘린더 통합 버전
import { Component, signal, OnInit, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatDialog } from "@angular/material/dialog";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { HomeDashboardService } from "../../Service/HomeDashboard";
import { LocalActivityService } from "../../Service/LocalActivityService";
import { StreakCalendarComponent } from "../StreakCallender/StreakCallender";
import { QuestDetailModalComponent } from "../QuestDetailModal/QuestDetailModal";
import { Router } from "@angular/router";
import { UserService } from "../../../Core/Service/UserService";

// 퀘스트 인터페이스 정의
interface DailyQuest {
  id: string;
  title: string;
  groupName: string;
  isCompleted: boolean;
  priority: 'high' | 'medium' | 'low';
  dueTime?: string;
}

interface QuickStat {
  id: string;
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'stable';
  icon: string;
  color: string;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
}

interface HighlightItem {
  id: string;
  type: 'challenge' | 'member' | 'achievement';
  title: string;
  description: string;
  badge?: string;
  time?: string;
  avatar?: string;
}

interface RecommendedChallenge {
  id: string;
  title: string;
  description: string;
  participants: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  image: string;
}

interface ActivitySummary {
  totalActivities: number;
  questsCompleted: number;
  streakDays: number;
  longestStreak: number;
  weeklyGoal: number;
  weeklyProgress: number;
}

@Component({
  selector: 'app-home-dashboard',
  templateUrl: './HomeDashboard.html',
  styleUrl: './HomeDashboard.css',
  imports: [CommonModule, MatIconModule, StreakCalendarComponent],
  providers: [HomeDashboardService],
  standalone: true
})
export class HomeDashboardComponent implements OnInit {
  // 서비스 주입
  private localActivityService = inject(LocalActivityService);
  private userService = inject(UserService);
  private dialog = inject(MatDialog);

  // 현재 시간
  currentTime = signal(new Date());

  // 로딩 상태
  isLoading = signal(true);

  // SharedService에서 사용자 정보 가져오기
  userName = computed(() => {
    const user = this.sharedState.currentUser();
    return user?.name || '사용자';
  });

  // 활동 요약 데이터
  activitySummary = signal<ActivitySummary>({
    totalActivities: 0,
    questsCompleted: 0,
    streakDays: 0,
    longestStreak: 0,
    weeklyGoal: 7,
    weeklyProgress: 0
  });

  // 빠른 통계
  quickStats = signal<QuickStat[]>([]);

  // 빠른 액션
  quickActions = signal<QuickAction[]>([
    {
      id: '1',
      title: '모임 대화',
      description: '모임에서 대화를 나눠보세요',
      icon: 'chat',
      route: '/chat',
      color: '#3182ce'
    },
    {
      id: '2',
      title: '새로운 모임 탐색',
      description: '관심있는 새로운 모임을 찾아보세요',
      icon: 'explore',
      route: '/browse',
      color: '#48bb78'
    },
    {
      id: '3',
      title: '상세 통계 보기',
      description: '자세한 진행 상황과 분석을 확인하세요',
      icon: 'analytics',
      route: '/dashboard',
      color: '#4299e1'
    },
    {
      id: '4',
      title: '퀘스트 완료하기',
      description: '오늘의 퀘스트를 확인하고 완료해보세요',
      icon: 'task_alt',
      route: '/quest',
      color: '#f6ad55'
    }
  ]);

  // 퀘스트 캘린더 데이터
  questCalendarData = signal<{ date: string; quests: DailyQuest[] }[]>([]);
  currentStreak = computed(() => this.localActivityService.getCurrentStreak());
  longestStreak = computed(() => this.localActivityService.getLongestStreak());

  // 오늘의 하이라이트
  highlights = computed<HighlightItem[]>(() => {
    const activities = this.localActivityService.activities();
    const recentActivities = activities.slice(0, 5);
    const activityStats = this.localActivityService.getActivityStats();

    const highlights: HighlightItem[] = [];

    if (activityStats.streakCount >= 7) {
      highlights.push({
        id: 'streak',
        type: 'achievement',
        title: `🔥 ${activityStats.streakCount}일 연속 활동 달성!`,
        description: '꾸준함의 힘으로 새로운 기록을 세우고 계시네요!',
        badge: '달성',
        time: '오늘'
      });
    }

    const recentQuests = recentActivities.filter(a => a.type === 'quest_complete');
    if (recentQuests.length > 0) {
      const latestQuest = recentQuests[0];
      highlights.push({
        id: 'recent-quest',
        type: 'challenge',
        title: latestQuest.title,
        description: latestQuest.description,
        time: this.getTimeAgo(latestQuest.timestamp),
        avatar: '🎯'
      });
    }

    const socialActivities = recentActivities.filter(a => 
      a.type === 'group_join' || a.type === 'club_join'
    );
    if (socialActivities.length > 0) {
      const latestSocial = socialActivities[0];
      highlights.push({
        id: 'recent-social',
        type: 'member',
        title: latestSocial.title,
        description: latestSocial.description,
        time: this.getTimeAgo(latestSocial.timestamp),
        avatar: '🤝'
      });
    }

    if (highlights.length === 0) {
      highlights.push({
        id: 'encouragement',
        type: 'challenge',
        title: '🌟 새로운 시작을 준비하세요!',
        description: '첫 번째 퀘스트를 완료하거나 모임에 참여해보세요.',
        badge: 'NEW',
        time: '지금'
      });
    }

    return highlights;
  });

  // 추천 퀘스트
  recommendedChallenges = signal<RecommendedChallenge[]>([]);

  // 개인화된 인사이트
  personalInsights = signal<string[]>([]);

  constructor(
    public sharedState: SharedStateService, 
    private router: Router, 
    private homeDashboardService: HomeDashboardService
  ) {}

  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    
    try {
      setInterval(() => {
        this.currentTime.set(new Date());
      }, 60000);

      await Promise.all([
        this.loadActivitySummary(),
        this.loadQuickStats(),
        this.loadRecommendedChallenges(),
        this.loadPersonalInsights(),
        this.loadQuestCalendarData()
      ]);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  // 퀘스트 캘린더 데이터 로드
  private async loadQuestCalendarData(): Promise<void> {
    try {
      const userCreds = await this.userService.getUserCredentials();
      if (!userCreds) return;

      // 현재 사용자의 퀘스트 데이터 가져오기
      const [questCur, userJoin] = await Promise.all([
        this.userService.getUserQuestCur(userCreds.id),
        this.userService.getUserJoin(userCreds.id)
      ]);

      if (!questCur || !userJoin) return;

      // 지난 90일간의 데이터 생성
      const questData: { date: string; quests: DailyQuest[] }[] = [];
      const today = new Date();

      for (let i = 89; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = this.formatDate(date);

        const dayQuests = this.generateQuestsForDate(dateStr, questCur, userJoin);
        questData.push({
          date: dateStr,
          quests: dayQuests
        });
      }

      this.questCalendarData.set(questData);
    } catch (error) {
      console.error('Error loading quest calendar data:', error);
    }
  }

  // 특정 날짜의 퀘스트 생성 (실제 데이터 기반)
  private generateQuestsForDate(date: string, questCur: any, userJoin: any): DailyQuest[] {
    const quests: DailyQuest[] = [];
    const dateObj = new Date(date);
    const today = new Date();
    
    // 오늘 이후의 날짜는 퀘스트 없음
    if (dateObj > today) return [];

    // 현재 진행중인 퀘스트들을 기반으로 생성
    if (questCur.curQuestTotalList) {
      questCur.curQuestTotalList.forEach((quest: any, index: number) => {
        // 모든 날짜에 모든 퀘스트를 표시하지 않고, 랜덤하게 일부만 표시
        const shouldInclude = Math.random() < 0.7; // 70% 확률로 포함
        
        if (shouldInclude) {
          const isCompleted = quest.isSuccess || Math.random() < 0.3; // 실제 완료 상태 또는 30% 확률로 완료
          
          quests.push({
            id: `quest-${date}-${index}`,
            title: quest.quest,
            groupName: quest.group,
            isCompleted: isCompleted,
            priority: this.getQuestPriority(quest.quest),
            dueTime: this.generateDueTime()
          });
        }
      });
    }

    // 추가로 더미 퀘스트 생성 (데이터가 부족한 경우)
    if (quests.length === 0 && Math.random() < 0.5) {
      const dummyQuests = [
        '아침 운동하기', '독서 30분', '물 8잔 마시기', '일기 쓰기', '명상 10분',
        '새로운 기술 학습', '친구와 연락하기', '건강한 식사', '스트레칭', '목표 점검'
      ];
      
      const questCount = Math.floor(Math.random() * 3) + 1; // 1-3개
      for (let i = 0; i < questCount; i++) {
        const questTitle = dummyQuests[Math.floor(Math.random() * dummyQuests.length)];
        quests.push({
          id: `dummy-${date}-${i}`,
          title: questTitle,
          groupName: '개인 목표',
          isCompleted: Math.random() < 0.6,
          priority: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)] as 'high' | 'medium' | 'low',
          dueTime: this.generateDueTime()
        });
      }
    }

    return quests;
  }

  private getQuestPriority(questTitle: string): 'high' | 'medium' | 'low' {
    const highPriorityKeywords = ['운동', '건강', '중요', '필수'];
    const lowPriorityKeywords = ['선택', '여가', '취미'];
    
    if (highPriorityKeywords.some(keyword => questTitle.includes(keyword))) {
      return 'high';
    }
    if (lowPriorityKeywords.some(keyword => questTitle.includes(keyword))) {
      return 'low';
    }
    return 'medium';
  }

  private generateDueTime(): string {
    const times = ['오전 9시', '오후 2시', '오후 6시', '오후 9시'];
    return Math.random() < 0.7 ? times[Math.floor(Math.random() * times.length)] : '';
  }

  // 퀘스트 클릭 이벤트 핸들러
  onQuestClick(event: { quest: DailyQuest; date: string }): void {
    console.log('Quest clicked:', event);
    
    // 활동 추적
    this.localActivityService.trackActivity(
      'quest_view',
      `${event.quest.title} 퀘스트 조회`,
      `${event.quest.groupName} 그룹의 퀘스트를 확인했습니다.`,
      { 
        questName: event.quest.title,
        groupName: event.quest.groupName,
        date: event.date
      }
    );

    // 해당 그룹으로 이동
    this.sharedState.setSelectedGroup(event.quest.groupName);
    this.sharedState.setActiveTab('group');
  }

  // 날짜 클릭 이벤트 핸들러 (모달 표시, 완료 기능 제거)
  onDayClick(event: { date: string; quests: DailyQuest[] }): void {
    console.log('Day clicked:', event);
    
    // 퀘스트 상세 모달 열기 (완료 기능 제거)
    const dialogRef = this.dialog.open(QuestDetailModalComponent, {
      width: '600px',
      maxHeight: '80vh',
      data: {
        date: this.formatDateForDisplay(event.date),
        quests: event.quests,
        onQuestClick: (quest: DailyQuest) => {
          this.onQuestClick({ quest, date: event.date });
        }
      }
    });
  }

  // 퀘스트 완료 표시 메서드 제거 (그룹 대시보드에서 처리)
  // private onMarkQuestCompleted 메서드 삭제

  // private updateQuestCompletionOnServer 메서드 삭제

  // 기존 메서드들...
  private async loadActivitySummary(): Promise<void> {
    try {
      const activityStats = this.localActivityService.getActivityStats();
      const questStats = await this.localActivityService.getQuestBasedStats();
      
      const weeklyGoal = 7;
      const currentStreak = this.localActivityService.getCurrentStreak();
      const weeklyProgress = Math.min(currentStreak, weeklyGoal);

      this.activitySummary.set({
        totalActivities: activityStats.totalActivities,
        questsCompleted: questStats.completedQuests,
        streakDays: currentStreak,
        longestStreak: activityStats.longestStreak,
        weeklyGoal,
        weeklyProgress
      });
    } catch (error) {
      console.error('Error loading activity summary:', error);
    }
  }

  private async loadQuickStats(): Promise<void> {
    try {
      const [serviceStats, localStats] = await Promise.all([
        this.homeDashboardService.getTodayBoard(),
        this.localActivityService.getQuestBasedStats()
      ]);

      const activityStats = this.localActivityService.getActivityStats();
      const groupStats = await this.localActivityService.getGroupParticipationStats();

      const enhancedStats: QuickStat[] = [
        {
          id: '1',
          title: '오늘 달성률',
          value: `${Math.max(parseInt(serviceStats[0]?.value) || 0, localStats.completionRate)}%`,
          change: this.getSmartGoalMessage(localStats.completionRate, activityStats.streakCount),
          trend: localStats.completionRate >= 70 ? 'up' : localStats.completionRate >= 40 ? 'stable' : 'down',
          icon: 'trending_up',
          color: '#3182ce'
        },
        {
          id: '2',
          title: '참여 모임',
          value: `${groupStats.totalGroups}개`,
          change: groupStats.totalGroups > 0 ? 
            `활발한 모임: ${groupStats.mostActiveGroup}` : 
            '첫 모임 참여를 기다리고 있어요!',
          trend: 'up',
          icon: 'groups',
          color: '#4299e1'
        },
        {
          id: '3',
          title: '연속 달성',
          value: `${activityStats.streakCount}일`,
          change: activityStats.streakCount >= 7 ? 
            '🔥 일주일 연속 달성!' : 
            activityStats.streakCount > 0 ?
            '좋은 페이스를 유지하고 있어요!' :
            '오늘부터 새로운 시작!',
          trend: 'up',
          icon: 'local_fire_department',
          color: '#f6ad55'
        },
        {
          id: '4',
          title: '총 포인트',
          value: `${activityStats.totalPoints}pt`,
          change: activityStats.averageDaily > 0 ? 
            `일평균 ${activityStats.averageDaily}pt` : 
            '첫 포인트를 획득해보세요!',
          trend: 'up',
          icon: 'star',
          color: '#48bb78'
        }
      ];

      this.quickStats.set(enhancedStats);
    } catch (error) {
      console.error('Error loading quick stats:', error);
    }
  }

  private async loadRecommendedChallenges(): Promise<void> {
    try {
      const challenges = await this.homeDashboardService.getRecommendedChallenge();
      this.recommendedChallenges.set(challenges);
    } catch (error) {
      console.error('Error loading recommended challenges:', error);
    }
  }

  private async loadPersonalInsights(): Promise<void> {
    try {
      const insights = await this.localActivityService.getPersonalizedInsights();
      this.personalInsights.set(insights.slice(0, 3));
    } catch (error) {
      console.error('Error loading personal insights:', error);
    }
  }

  // 유틸리티 메서드들...
  private getSmartGoalMessage(completionRate: number, streakDays: number): string {
    if (completionRate >= 90) return '완벽에 가까워요! 🎯';
    if (completionRate >= 80) return '훌륭한 성과입니다! ⭐';
    if (completionRate >= 70) return '좋은 페이스를 유지하고 있어요! 👍';
    if (completionRate >= 50) return '절반을 넘어섰어요! 💪';
    if (completionRate >= 30) return '꾸준히 진행하고 있어요! 📈';
    if (streakDays > 0) return '연속 기록을 이어가고 있어요! 🔥';
    return '오늘부터 새로운 시작! 🌱';
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private formatDateForDisplay(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  }

  // UI 메서드들
  getGreeting(): string {
    const hour = this.currentTime().getHours();
    const userName = this.userName();
    
    let timeGreeting = '';
    if (hour < 12) timeGreeting = '좋은 아침이에요';
    else if (hour < 18) timeGreeting = '좋은 오후에요';
    else timeGreeting = '좋은 저녁이에요';
    
    return `${userName}님, ${timeGreeting}`;
  }

  getFormattedTime(): string {
    return this.currentTime().toLocaleString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getDifficultyColor(difficulty: string): string {
    switch (difficulty) {
      case 'easy': return '#48bb78';
      case 'medium': return '#f6ad55';
      case 'hard': return '#e53e3e';
      default: return '#718096';
    }
  }

  getDifficultyText(difficulty: string): string {
    switch (difficulty) {
      case 'easy': return '쉬움';
      case 'medium': return '보통';
      case 'hard': return '어려움';
      default: return '알 수 없음';
    }
  }

  getTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}일 전`;
    if (hours > 0) return `${hours}시간 전`;
    if (minutes > 0) return `${minutes}분 전`;
    return '방금 전';
  }

  getWeeklyProgressPercent(): number {
    const summary = this.activitySummary();
    return Math.round((summary.weeklyProgress / summary.weeklyGoal) * 100);
  }

  // 액션 핸들러들
  onQuickAction(action: QuickAction): void {
    console.log('Quick action clicked:', action.route);
    
    this.localActivityService.trackActivity(
      'page_visit',
      `${action.title} 페이지 방문`,
      `${action.description}`,
      { route: action.route }
    );

    switch (action.route) {
      case '/challenge':
      case '/chat':
        this.sharedState.setActiveTab('group');
        break;
      case '/browse':
        this.router.navigate(['/group/join']);
        break;
      case '/dashboard':
        this.sharedState.setActiveTab('activity');
        break;
      case '/quest':
        this.sharedState.setActiveTab('group');
        break;
      default:
        console.log('Unknown route:', action.route);
    }
  }

  onJoinChallenge(challenge: RecommendedChallenge): void {
    console.log('Join challenge:', challenge.id);
    
    this.localActivityService.trackActivity(
      'quest_start',
      `${challenge.title} 퀘스트 시작`,
      `${challenge.category} 카테고리의 퀘스트에 참여했습니다.`,
      { 
        questName: challenge.title,
        groupName: challenge.category,
        difficulty: challenge.difficulty 
      }
    );

    this.sharedState.setSelectedGroup(challenge.category);
    this.sharedState.setSelectedChannel(null);
    this.sharedState.setActiveTab('group');
  }

  onViewAllChallenges(): void {
    console.log('View all challenges');
    this.localActivityService.trackActivity(
      'page_visit',
      '전체 챌린지 보기',
      '모든 사용 가능한 챌린지를 탐색합니다.'
    );
    this.sharedState.setActiveTab('group');
  }

  onViewAllHighlights(): void {
    console.log('View all highlights');
    this.localActivityService.trackActivity(
      'page_visit',
      '전체 활동 보기',
      '상세한 활동 내역을 확인합니다.'
    );
    this.sharedState.setActiveTab('activity');
  }

  onViewDetailedStats(): void {
    this.localActivityService.trackActivity(
      'page_visit',
      '상세 통계 보기',
      '개인 활동 분석 페이지로 이동했습니다.'
    );
    this.sharedState.setActiveTab('activity');
  }

  // 사용자 정보 관련
  isUserLoaded(): boolean {
    return this.sharedState.currentUser() !== null;
  }

  getUserInitials(): string {
    const user = this.sharedState.currentUser();
    if (!user?.name) return '?';
    
    const names = user.name.split(' ');
    if (names.length >= 2) {
      return names[0][0] + names[1][0];
    }
    return user.name[0] || '?';
  }
}