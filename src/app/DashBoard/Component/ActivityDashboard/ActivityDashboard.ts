import { Component, signal, OnInit, inject, input, effect } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ActivityDashboardService } from "../../Service/ActivityDashboard";
import { LocalActivityService } from "../../Service/LocalActivityService";
import { SharedStateService } from "../../../Core/Service/SharedService";

interface ActivityItem {
  id: string;
  type: 'quest_completed' | 'milestone' | 'encouragement' | 'group_join' | 'club_join' | 'achievement';
  title: string;
  description: string;
  timestamp: Date;
  icon: string;
  points?: number;
  priority: 'high' | 'medium' | 'low';
}

interface DailyActivity {
  date: string;
  completed: number;
  target: number;
}

interface WeeklyPattern {
  day: string;
  hours: number;
  totalActivities: number;
}

interface SmartInsight {
  type: 'streak' | 'quest' | 'social' | 'achievement';
  message: string;
  priority: 'high' | 'medium' | 'low';
  icon: string;
  actionable?: boolean;
  suggestion?: string;
}

interface ActivityData {
  dailyQuests: DailyActivity[];
  streak: number;
  totalCompleted: number;
  monthlyAchievementRate: number;
  recentActivities: ActivityItem[];
  weeklyPattern: WeeklyPattern[];
  favoriteQuestType: string;
  bestDay: string;
  smartInsights: SmartInsight[];
  personalizedStats: any;
}

@Component({
  selector: 'app-activity-dashboard',
  templateUrl: './ActivityDashboard.html',
  styleUrl: './ActivityDashboard.css',
  imports: [CommonModule, MatIconModule],
  providers: [ActivityDashboardService],
  standalone: true
})
export class ActivityDashboardComponent implements OnInit {
  // 서비스 주입
  private localActivityService = inject(LocalActivityService);
  private sharedStateService = inject(SharedStateService);

  // 데이터 signals
  activityData = signal<ActivityData | null>(null);
  isLoading = signal<boolean>(true);
  selectedPeriod = signal<'week' | 'month'>('week');

  // 통계 signals
  weeklyStats = signal<any[]>([]);
  recentActivities = signal<ActivityItem[]>([]);
  smartInsights = signal<SmartInsight[]>([]);

  constructor(private activityDashboardService: ActivityDashboardService) {
    // SharedStateService의 사용자 데이터 변경 감지
    effect(() => {
      const userJoin = this.sharedStateService.userJoin();
      const currentUser = this.sharedStateService.currentUser();
      
      // 사용자 데이터가 변경되면 대시보드 데이터 새로고침
      if (userJoin && currentUser && this.sharedStateService.initialized()) {
        this.refreshActivityData();
      }
    });
  }

  ngOnInit(): void {
    this.loadEnhancedActivityData();
  }

  // 실시간 데이터 새로고침 메서드
  private async refreshActivityData(): Promise<void> {
    if (this.isLoading()) return; // 이미 로딩 중이면 중복 실행 방지
    
    console.log('🔄 사용자 데이터 변경 감지 - 대시보드 데이터 새로고침');
    await this.loadEnhancedActivityData();
  }

  // 캐시 기반 데이터 직접 조회로 변경
  private async loadEnhancedActivityData(): Promise<void> {
    this.isLoading.set(true);

    try {
      // 캐시된 사용자 데이터 직접 사용 (실시간 반영)
      const userCredentials = await this.activityDashboardService.userService.getUserCredentials();
      if (!userCredentials) {
        await this.loadFallbackData();
        return;
      }

      // 실시간 캐시 데이터 조회
      const [questCur, questPrev, questContinuous, questWeekly] = await Promise.all([
        this.activityDashboardService.userService.getUserQuestCur(userCredentials.id),
        this.activityDashboardService.userService.getUserQuestPrev(userCredentials.id),
        this.activityDashboardService.userService.getUserQuestContinuous(userCredentials.id),
        this.activityDashboardService.userService.getUserQuestWeekly(userCredentials.id)
      ]);

      // 실시간 통계 계산
      const realTimeStats = this.calculateRealTimeStats(questCur, questPrev, questContinuous, questWeekly);
      
      // LocalActivity 데이터와 병합
      const [localStats, groupStats, insights] = await Promise.all([
        this.localActivityService.getQuestBasedStats().catch(() => this.getEmptyQuestStats()),
        this.localActivityService.getGroupParticipationStats().catch(() => this.getEmptyGroupStats()),
        this.localActivityService.getEnhancedPersonalizedInsights().catch(() => this.getDefaultInsights())
      ]);

      const inputData: ActivityData = {
        dailyQuests: await this.generateRealTimeDailyQuests(questPrev),
        streak: realTimeStats.streak,
        totalCompleted: realTimeStats.totalCompleted,
        monthlyAchievementRate: realTimeStats.achievementRate,
        recentActivities: this.generatePrioritizedRecentActivities(),
        weeklyPattern: await this.generateRealTimeWeeklyPattern(questWeekly),
        favoriteQuestType: realTimeStats.favoriteType || localStats.favoriteGroup || '없음',
        bestDay: realTimeStats.bestDay || '없음',
        smartInsights: insights,
        personalizedStats: {
          localStats,
          groupStats,
          activityStats: this.localActivityService.getActivityStats(),
          realTimeStats // 실시간 통계 추가
        }
      };

      console.log('📊 실시간 ActivityData 생성:', inputData);
      this.activityData.set(inputData);
      this.processEnhancedActivityData(inputData);
      this.smartInsights.set(insights);
      
    } catch (error) {
      console.error('Error loading enhanced activity data:', error);
      await this.loadFallbackData();
    } finally {
      this.isLoading.set(false);
    }
  }

  // 실시간 통계 계산 메서드
  private calculateRealTimeStats(
    questCur: any, 
    questPrev: any, 
    questContinuous: any, 
    questWeekly: any
  ): {
    streak: number;
    totalCompleted: number;
    achievementRate: number;
    favoriteType: string;
    bestDay: string;
  } {
    // 연속 일수 (실시간)
    const streak = questContinuous?.continuousSuccessQuestList?.days || 0;
    
    // 총 완료 수 (실시간)
    const totalCompleted = questContinuous?.continuousSuccessQuestList?.totalQuestNum || 0;
    
    // 주간 달성률 (실시간)
    let achievementRate = 0;
    if (questPrev?.prevQuestTotalList?.length > 0) {
      const successCount = questPrev.prevQuestTotalList.filter((q: any) => q.success).length;
      achievementRate = Math.round((successCount / questPrev.prevQuestTotalList.length) * 100);
    }
    
    // 선호 퀘스트 타입 (실시간)
    let favoriteType = '';
    if (questWeekly?.weeklyQuestList?.length > 0) {
      const groupCounts: { [key: string]: number } = {};
      questWeekly.weeklyQuestList.forEach((week: any) => {
        if (week.bestParticipateGroup) {
          groupCounts[week.bestParticipateGroup] = (groupCounts[week.bestParticipateGroup] || 0) + 1;
        }
      });
      favoriteType = Object.entries(groupCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0] || '';
    }
    
    // 최고 활동일 (실시간)
    let bestDay = '';
    if (questWeekly?.weeklyQuestList?.length > 0) {
      const bestDayData = questWeekly.weeklyQuestList
        .sort((a: any, b: any) => b.successQuestNum - a.successQuestNum)[0];
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      bestDay = dayNames[bestDayData.day] || '';
    }

    return {
      streak,
      totalCompleted,
      achievementRate,
      favoriteType,
      bestDay
    };
  }

  // 실시간 일별 퀘스트 생성
  private async generateRealTimeDailyQuests(questPrev: any): Promise<DailyActivity[]> {
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    let dailyQuests: DailyActivity[] = dayNames.map(day => ({
      date: day,
      completed: 0,
      target: 0
    }));

    if (questPrev?.prevQuestTotalList) {
      questPrev.prevQuestTotalList.forEach((quest: any) => {
        const date = new Date(quest.completeTime).getDay();
        dailyQuests[date].target += 1;
        if (quest.success) {
          dailyQuests[date].completed += 1;
        }
      });
    }

    // LocalActivity 데이터로 보완
    const localActivities = this.localActivityService.activities();
    localActivities.forEach(activity => {
      if (activity.type === 'quest_complete') {
        const dayIndex = new Date(activity.timestamp).getDay();
        // 중복 카운팅 방지를 위해 조건부 추가
        if (dailyQuests[dayIndex].target < dailyQuests[dayIndex].completed + 2) {
          dailyQuests[dayIndex].target = dailyQuests[dayIndex].completed + 2;
        }
      }
    });

    return dailyQuests;
  }

  // 실시간 주간 패턴 생성
  private async generateRealTimeWeeklyPattern(questWeekly: any): Promise<WeeklyPattern[]> {
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    let weeklyPattern: WeeklyPattern[] = dayNames.map(day => ({
      day,
      hours: 0,
      totalActivities: 0
    }));

    if (questWeekly?.weeklyQuestList) {
      questWeekly.weeklyQuestList.forEach((quest: any) => {
        weeklyPattern[quest.day].hours = quest.questTotalNum || 0;
        weeklyPattern[quest.day].totalActivities = quest.successQuestNum || 0;
      });
    }

    // LocalActivity 데이터로 보완
    const localActivities = this.localActivityService.activities();
    localActivities.forEach(activity => {
      const dayIndex = new Date(activity.timestamp).getDay();
      weeklyPattern[dayIndex].totalActivities = Math.max(
        weeklyPattern[dayIndex].totalActivities,
        weeklyPattern[dayIndex].totalActivities + (activity.type === 'quest_complete' ? 1 : 0)
      );
    });

    return weeklyPattern;
  }

  private generatePrioritizedRecentActivities(): ActivityItem[] {
    const localActivities = this.localActivityService.activities();
    const recentLocal = localActivities.slice(0, 10);

    // 우선순위 기반 활동 필터링 및 변환
    const prioritizedActivities: ActivityItem[] = recentLocal
      .map(activity => ({
        id: activity.id,
        type: this.mapActivityType(activity.type),
        title: this.generateEngagingTitle(activity),
        description: this.generatePersonalizedDescription(activity),
        timestamp: activity.timestamp,
        icon: this.getActivityIcon(activity.type, activity.context),
        points: activity.points,
        priority: this.calculatePriority(activity)
      }))
      .filter(activity => activity.priority !== 'low')
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return b.timestamp.getTime() - a.timestamp.getTime();
      })
      .slice(0, 6);

    // 기본 활동이 없을 경우 샘플 데이터
    if (prioritizedActivities.length === 0) {
      return this.generateBasicRecentActivities();
    }

    return prioritizedActivities;
  }

  private async loadFallbackData(): Promise<void> {
    const fundamentalData = await this.activityDashboardService.getQuestScore();
    const getBestType = await this.activityDashboardService.getBestType();
    
    const inputData: ActivityData = {
      dailyQuests: await this.generateDailyQuests(),
      streak: fundamentalData[0] || 0,
      totalCompleted: fundamentalData[1] || 0,
      monthlyAchievementRate: fundamentalData[2] || 0,
      recentActivities: this.generateBasicRecentActivities(),
      weeklyPattern: await this.generateWeeklyPattern(),
      favoriteQuestType: getBestType[0] || '없음',
      bestDay: getBestType[1] || '없음',
      smartInsights: [{
        type: 'quest',
        message: '🌱 새로운 활동을 시작해보세요!',
        priority: 'medium',
        icon: '✨',
        suggestion: '첫 번째 퀘스트에 도전해보세요'
      }],
      personalizedStats: null
    };

    this.activityData.set(inputData);
    this.processEnhancedActivityData(inputData);
  }

  private processEnhancedActivityData(data: ActivityData): void {
    // 개인화된 통계 계산
    const localStats = data.personalizedStats?.localStats;
    const activityStats = data.personalizedStats?.activityStats;

    const weeklyStats = [
      {
        label: '연속 참여',
        value: data.streak || 0,
        unit: '일',
        icon: 'local_fire_department',
        color: '#3182ce',
        trend: (data.streak || 0) > 7 ? 'up' : 'stable'
      },
      {
        label: '총 완료',
        value: data.totalCompleted || 0,
        unit: '개',
        icon: 'check_circle',
        color: '#2b6cb0',
        trend: 'up'
      },
      {
        label: '주간 달성률',
        value: data.monthlyAchievementRate || 0,
        unit: '%',
        icon: 'trending_up',
        color: '#4299e1',
        trend: (data.monthlyAchievementRate || 0) >= 80 ? 'up' : 'stable'
      },
      {
        label: localStats ? '참여 그룹' : '평균 점수',
        value: localStats 
          ? (data.personalizedStats?.groupStats?.totalGroups || 0) 
          : 8.5,
        unit: localStats ? '개' : '점',
        icon: localStats ? 'groups' : 'star',
        color: '#68d391',
        trend: 'stable'
      }
    ];

    this.weeklyStats.set(weeklyStats);
    this.recentActivities.set(data.recentActivities || []);
  }

  // UI 메서드들
  setPeriod(period: 'week' | 'month'): void {
    this.selectedPeriod.set(period);
  }

  // 안전한 퍼센티지 계산 (0으로 나누기 방지 및 유효하지 않은 값 처리)
  getSafePercentage(completed: number, target: number): number {
    const safeCompleted = completed || 0;
    const safeTarget = target || 0;
    
    if (safeTarget === 0) return 0;
    
    const percentage = (safeCompleted / safeTarget) * 100;
    return Math.min(Math.max(percentage, 0), 100);
  }

  getCompletionRate(): number {
    const data = this.activityData();
    if (!data || !data.dailyQuests || data.dailyQuests.length === 0) return 0;
    
    const totalTarget = data.dailyQuests.reduce((sum, day) => sum + (day.target || 0), 0);
    const totalCompleted = data.dailyQuests.reduce((sum, day) => sum + (day.completed || 0), 0);
    
    return totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0;
  }

  getActivityTypeColor(type: string): string {
    const colorMap: { [key: string]: string } = {
      'quest_completed': '#2b6cb0',
      'milestone': '#3182ce', 
      'encouragement': '#4299e1',
      'group_join': '#68d391',
      'club_join': '#4fd1c7',
      'achievement': '#f6ad55'
    };
    return colorMap[type] || '#a0aec0';
  }

  getActivityTypeBadge(type: string): string {
    const badgeMap: { [key: string]: string } = {
      'quest_completed': '완료',
      'milestone': '달성',
      'encouragement': '응원',
      'group_join': '가입',
      'club_join': '참여',
      'achievement': '성취'
    };
    return badgeMap[type] || '';
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

  getInsightIcon(insight: SmartInsight): string {
    return insight.icon;
  }

  async refreshData(): Promise<void> {
    await this.loadEnhancedActivityData();
  }

  hasHighPriorityInsights(): boolean {
    return this.smartInsights().some(insight => insight.priority === 'high');
  }

  getTopInsight(): SmartInsight | null {
    const insights = this.smartInsights();
    return insights.length > 0 ? insights[0] : null;
  }

  // 활동 패턴 바 너비 계산 (최대값 기준으로 정규화)
  getPatternBarWidth(dayActivity: number, weeklyPattern: WeeklyPattern[]): number {
    if (!weeklyPattern || weeklyPattern.length === 0) return 0;
    
    const maxActivity = Math.max(...weeklyPattern.map(day => day.totalActivities));
    if (maxActivity === 0) return 0;
    
    return Math.round((dayActivity / maxActivity) * 100);
  }

  // 활동 강도에 따른 색상 결정
  getPatternBarColor(dayActivity: number, weeklyPattern: WeeklyPattern[]): string {
    if (!weeklyPattern || weeklyPattern.length === 0) return '#e2e8f0';
    
    const maxActivity = Math.max(...weeklyPattern.map(day => day.totalActivities));
    const percentage = maxActivity > 0 ? (dayActivity / maxActivity) * 100 : 0;
    
    if (percentage >= 80) return '#3182ce';
    if (percentage >= 60) return '#4299e1';
    if (percentage >= 40) return '#63b3ed';
    if (percentage >= 20) return '#90cdf4';
    if (percentage > 0) return '#bee3f8';
    return '#e2e8f0';
  }

  // 활동 강도 레벨 텍스트
  getActivityLevel(dayActivity: number, weeklyPattern: WeeklyPattern[]): string {
    if (!weeklyPattern || weeklyPattern.length === 0) return '';
    
    const maxActivity = Math.max(...weeklyPattern.map(day => day.totalActivities));
    const percentage = maxActivity > 0 ? (dayActivity / maxActivity) * 100 : 0;
    
    if (percentage >= 80) return '🔥 매우 활발';
    if (percentage >= 60) return '⭐ 활발';
    if (percentage >= 40) return '👍 보통';
    if (percentage >= 20) return '📈 시작';
    if (percentage > 0) return '🌱 활동';
    return '💤 휴식';
  }

  // 주간 패턴 통계 계산 메서드들
  getWeeklyTotal(weeklyPattern: WeeklyPattern[]): number {
    return weeklyPattern.reduce((sum, day) => sum + day.totalActivities, 0);
  }

  getWeeklyAverage(weeklyPattern: WeeklyPattern[]): string {
    const total = this.getWeeklyTotal(weeklyPattern);
    const average = total / weeklyPattern.length;
    return average.toFixed(1);
  }

  getMostActiveDay(weeklyPattern: WeeklyPattern[]): string {
    if (!weeklyPattern || weeklyPattern.length === 0) return '-';
    const mostActive = weeklyPattern.reduce((max, day) => 
      day.totalActivities > max.totalActivities ? day : max
    );
    return mostActive.day;
  }

  getActiveDays(weeklyPattern: WeeklyPattern[]): number {
    return weeklyPattern.filter(day => day.totalActivities > 0).length;
  }

  // 헬퍼 메서드들
  private getEmptyQuestStats() {
    return {
      currentQuests: 0,
      completedQuests: 0,
      completionRate: 0,
      favoriteGroup: '없음',
      weeklyProgress: []
    };
  }

  private getEmptyGroupStats() {
    return {
      totalGroups: 0,
      totalClubs: 0,
      mostActiveGroup: '없음',
      recentlyJoinedGroup: '없음',
      groupDetails: []
    };
  }

  private getDefaultInsights() {
    return [{
      type: 'quest' as const,
      message: '🌱 새로운 활동을 시작해보세요!',
      priority: 'medium' as const,
      icon: '✨',
      suggestion: '첫 번째 퀘스트에 도전해보세요'
    }];
  }

  private mapActivityType(localType: string): ActivityItem['type'] {
    const typeMap: { [key: string]: ActivityItem['type'] } = {
      'quest_complete': 'quest_completed',
      'group_join': 'group_join',
      'club_join': 'club_join',
      'quest_start': 'milestone',
      'page_visit': 'encouragement'
    };
    return typeMap[localType] || 'encouragement';
  }

  private generateEngagingTitle(activity: any): string {
    const titleTemplates: { [key: string]: string } = {
      'quest_complete': `🎯 ${activity.context?.questName || '퀘스트'} 완료!`,
      'group_join': `🤝 ${activity.context?.groupName || '새 그룹'}에 합류`,
      'club_join': `📢 ${activity.context?.clubName || '채널'} 참여`,
      'quest_start': `🚀 새로운 도전 시작`,
      'page_visit': `👀 새로운 탐험`
    };
    return titleTemplates[activity.type] || activity.title;
  }

  private generatePersonalizedDescription(activity: any): string {
    const descriptions: { [key: string]: string } = {
      'quest_complete': `${activity.context?.groupName || '그룹'}에서 성공적으로 완료했습니다! 🌟`,
      'group_join': `새로운 커뮤니티와의 만남이 시작되었습니다 ✨`,
      'club_join': `${activity.context?.groupName || '그룹'}에서 활발한 소통을 시작해보세요 💬`,
      'quest_start': `새로운 목표 달성을 위한 첫 걸음을 내딛었습니다 🏃‍♀️`,
      'page_visit': `탐험 정신으로 새로운 영역을 발견했습니다 🗺️`
    };
    return descriptions[activity.type] || activity.description;
  }

  private getActivityIcon(type: string, context?: any): string {
    const iconMap: { [key: string]: string } = {
      'quest_complete': '🏆',
      'group_join': '🤝',
      'club_join': '📢',
      'quest_start': '🚀',
      'page_visit': '👀',
      'message_send': '💬',
      'search_action': '🔍'
    };
    return iconMap[type] || '✨';
  }

  private calculatePriority(activity: any): 'high' | 'medium' | 'low' {
    if (activity.type === 'quest_complete' && activity.points >= 15) return 'high';
    if (activity.type === 'group_join' || activity.type === 'club_join') return 'high';
    if (activity.points >= 10) return 'medium';
    if (activity.type === 'page_visit' && activity.points <= 2) return 'low';
    return 'medium';
  }

  private generateBasicRecentActivities(): ActivityItem[] {
    return [
      {
        id: '1',
        type: 'quest_completed',
        title: '🌟 첫 번째 퀘스트 완료 준비',
        description: '새로운 도전을 시작할 준비가 되었습니다!',
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
        icon: '🎯',
        priority: 'medium'
      }
    ];
  }

  private async generateDailyQuests(): Promise<DailyActivity[]> {
    return await this.activityDashboardService.pastDailyComplete();
  }

  private async generateWeeklyPattern(): Promise<WeeklyPattern[]> {
    return await this.activityDashboardService.getWeeklyPattern();
  }
}