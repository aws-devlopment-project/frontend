import { Component, signal, OnInit, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { HomeDashboardService } from "../../Service/HomeDashboard";
import { LocalActivityService } from "../../Service/LocalActivityService";
import { StreakCalendarComponent } from "../StreakCallender/StreakCallender";
import { Router } from "@angular/router";

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

  // 빠른 통계 - LocalActivityService 데이터 활용
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

  // 스트릭 캘린더 데이터
  heatmapData = computed(() => this.localActivityService.getHeatmapData());
  currentStreak = computed(() => this.localActivityService.getCurrentStreak());
  longestStreak = computed(() => this.localActivityService.getLongestStreak());

  // 오늘의 하이라이트 - LocalActivityService의 실제 활동 기반
  highlights = computed<HighlightItem[]>(() => {
    const activities = this.localActivityService.activities();
    const recentActivities = activities.slice(0, 5);
    const activityStats = this.localActivityService.getActivityStats();

    const highlights: HighlightItem[] = [];

    // 연속 기록 달성
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

    // 최근 퀘스트 완료 활동
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

    // 그룹/클럽 참여 활동
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

    // 활동이 없을 경우 격려 메시지
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
      // 실시간 시간 업데이트
      setInterval(() => {
        this.currentTime.set(new Date());
      }, 60000);

      // 병렬로 데이터 로드
      await Promise.all([
        this.loadActivitySummary(),
        this.loadQuickStats(),
        this.loadRecommendedChallenges(),
        this.loadPersonalInsights()
      ]);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadActivitySummary(): Promise<void> {
    try {
      const activityStats = this.localActivityService.getActivityStats();
      const questStats = await this.localActivityService.getQuestBasedStats();
      
      // 주간 목표 대비 진행률 계산
      const weeklyGoal = 7; // 주 7일 목표
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
      // HomeDashboardService와 LocalActivityService 데이터 병합
      const [serviceStats, localStats] = await Promise.all([
        this.homeDashboardService.getTodayBoard(),
        this.localActivityService.getQuestBasedStats()
      ]);

      const activityStats = this.localActivityService.getActivityStats();
      const groupStats = await this.localActivityService.getGroupParticipationStats();

      // LocalActivity 데이터로 보강된 통계
      const enhancedStats: QuickStat[] = [
        {
          id: '1',
          title: '오늘 달성률',
          value: `${Math.max(parseInt(serviceStats[0].value) || 0, localStats.completionRate)}%`,
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
      this.personalInsights.set(insights.slice(0, 3)); // 상위 3개만
    } catch (error) {
      console.error('Error loading personal insights:', error);
    }
  }

  // 스마트한 목표 메시지 생성
  private getSmartGoalMessage(completionRate: number, streakDays: number): string {
    if (completionRate >= 90) return '완벽에 가까워요! 🎯';
    if (completionRate >= 80) return '훌륭한 성과입니다! ⭐';
    if (completionRate >= 70) return '좋은 페이스를 유지하고 있어요! 👍';
    if (completionRate >= 50) return '절반을 넘어섰어요! 💪';
    if (completionRate >= 30) return '꾸준히 진행하고 있어요! 📈';
    if (streakDays > 0) return '연속 기록을 이어가고 있어요! 🔥';
    return '오늘부터 새로운 시작! 🌱';
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

  // 주간 진행률 퍼센트 계산
  getWeeklyProgressPercent(): number {
    const summary = this.activitySummary();
    return Math.round((summary.weeklyProgress / summary.weeklyGoal) * 100);
  }

  // 액션 핸들러들
  onQuickAction(action: QuickAction): void {
    console.log('Quick action clicked:', action.route);
    
    // LocalActivityService에 페이지 방문 추적
    this.localActivityService.trackActivity(
      'page_visit',
      `${action.title} 페이지 방문`,
      `${action.description}`,
      { route: action.route }
    );

    // 네비게이션 처리
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
    
    // 퀘스트 시작 추적
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