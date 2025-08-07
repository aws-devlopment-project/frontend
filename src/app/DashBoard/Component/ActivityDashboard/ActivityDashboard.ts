import { Component, signal, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ActivityDashboardService } from "../../Service/ActivityDashboard";
import { LocalActivityService } from "../../Service/LocalActivityService";

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

  // 데이터 signals
  activityData = signal<ActivityData | null>(null);
  isLoading = signal<boolean>(true);
  selectedPeriod = signal<'week' | 'month'>('week');

  // 통계 signals
  weeklyStats = signal<any[]>([]);
  recentActivities = signal<ActivityItem[]>([]);
  smartInsights = signal<SmartInsight[]>([]);

  constructor(private activityDashboardService: ActivityDashboardService) {}

  ngOnInit(): void {
    this.loadEnhancedActivityData();
  }

  private async loadEnhancedActivityData(): Promise<void> {
    this.isLoading.set(true);

    try {
      // 기존 데이터와 LocalActivity 데이터를 병합
      const [fundamentalData, getBestType, localStats, groupStats, insights] = await Promise.all([
        this.activityDashboardService.getQuestScore(),
        this.activityDashboardService.getBestType(),
        this.localActivityService.getQuestBasedStats(),
        this.localActivityService.getGroupParticipationStats(),
        this.localActivityService.getEnhancedPersonalizedInsights()
      ]);

      const inputData: ActivityData = {
        dailyQuests: await this.generateEnhancedDailyQuests(),
        streak: Math.max(fundamentalData[0], this.localActivityService.getCurrentStreak()),
        totalCompleted: fundamentalData[1] + localStats.completedQuests,
        monthlyAchievementRate: Math.max(fundamentalData[2], localStats.completionRate),
        recentActivities: this.generatePrioritizedRecentActivities(),
        weeklyPattern: await this.generateEnhancedWeeklyPattern(),
        favoriteQuestType: localStats.favoriteGroup || getBestType[0],
        bestDay: getBestType[1],
        smartInsights: insights,
        personalizedStats: {
          localStats,
          groupStats,
          activityStats: this.localActivityService.getActivityStats()
        }
      };

      this.activityData.set(inputData);
      this.processEnhancedActivityData(inputData);
      this.smartInsights.set(insights);
    } catch (error) {
      console.error('Error loading enhanced activity data:', error);
      // 폴백 데이터 로드
      await this.loadFallbackData();
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadFallbackData(): Promise<void> {
    const fundamentalData = await this.activityDashboardService.getQuestScore();
    const getBestType = await this.activityDashboardService.getBestType();
    
    const inputData: ActivityData = {
      dailyQuests: await this.generateDailyQuests(),
      streak: fundamentalData[0],
      totalCompleted: fundamentalData[1],
      monthlyAchievementRate: fundamentalData[2],
      recentActivities: this.generateBasicRecentActivities(),
      weeklyPattern: await this.generateWeeklyPattern(),
      favoriteQuestType: getBestType[0],
      bestDay: getBestType[1],
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

  private async generateEnhancedDailyQuests(): Promise<DailyActivity[]> {
    const baseQuests = await this.activityDashboardService.pastDailyComplete();
    const localActivities = this.localActivityService.activities();

    // LocalActivity 데이터로 보완
    const enhancedQuests = baseQuests.map(quest => {
      const dayIndex = ['일', '월', '화', '수', '목', '금', '토'].indexOf(quest.date);
      const dayActivities = localActivities.filter(activity => {
        const activityDay = new Date(activity.timestamp).getDay();
        return activityDay === dayIndex && activity.type === 'quest_complete';
      });

      return {
        ...quest,
        completed: Math.max(quest.completed, dayActivities.length),
        target: Math.max(quest.target, quest.completed + 2) // 동적 목표 조정
      };
    });

    return enhancedQuests;
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

  private async generateEnhancedWeeklyPattern(): Promise<WeeklyPattern[]> {
    const basePattern = await this.activityDashboardService.getWeeklyPattern();
    const activityStats = this.localActivityService.getActivityStats();
    
    // LocalActivity 데이터로 패턴 보강
    return basePattern.map((pattern, index) => ({
      ...pattern,
      totalActivities: Math.max(pattern.totalActivities, this.getLocalActivitiesForDay(index))
    }));
  }

  private getLocalActivitiesForDay(dayIndex: number): number {
    const activities = this.localActivityService.activities();
    return activities.filter(activity => {
      const activityDay = new Date(activity.timestamp).getDay();
      return activityDay === dayIndex;
    }).length;
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

  private processEnhancedActivityData(data: ActivityData): void {
    // 개인화된 통계 계산
    const localStats = data.personalizedStats?.localStats;
    const activityStats = data.personalizedStats?.activityStats;

    const weeklyStats = [
      {
        label: '연속 참여',
        value: data.streak,
        unit: '일',
        icon: 'local_fire_department',
        color: '#3182ce',
        trend: data.streak > 7 ? 'up' : 'stable'
      },
      {
        label: '총 완료',
        value: data.totalCompleted,
        unit: '개',
        icon: 'check_circle',
        color: '#2b6cb0',
        trend: 'up'
      },
      {
        label: '주간 달성률',
        value: data.monthlyAchievementRate,
        unit: '%',
        icon: 'trending_up',
        color: '#4299e1',
        trend: data.monthlyAchievementRate >= 80 ? 'up' : 'stable'
      },
      {
        label: localStats ? '참여 그룹' : '평균 점수',
        value: localStats ? data.personalizedStats.groupStats.totalGroups : 8.5,
        unit: localStats ? '개' : '점',
        icon: localStats ? 'groups' : 'star',
        color: '#68d391',
        trend: 'stable'
      }
    ];

    this.weeklyStats.set(weeklyStats);
    this.recentActivities.set(data.recentActivities);
  }

  // UI 메서드들
  setPeriod(period: 'week' | 'month'): void {
    this.selectedPeriod.set(period);
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

  getCompletionRate(): number {
    const data = this.activityData();
    if (!data) return 0;
    
    const totalTarget = data.dailyQuests.reduce((sum, day) => sum + day.target, 0);
    const totalCompleted = data.dailyQuests.reduce((sum, day) => sum + day.completed, 0);
    
    return totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0;
  }

  getBestPerformanceDay(): string {
    const data = this.activityData();
    if (!data) return '';
    
    const bestDay = data.weeklyPattern.reduce((best, current) => 
      current.totalActivities > best.totalActivities ? current : best
    );
    
    return bestDay.day;
  }

  getInsightIcon(insight: SmartInsight): string {
    return insight.icon;
  }

  getInsightColor(insight: SmartInsight): string {
    const colorMap: { [key: string]: string } = {
      'high': '#3182ce',
      'medium': '#4299e1', 
      'low': '#a0aec0'
    };
    return colorMap[insight.priority] || '#a0aec0';
  }

  async refreshData(): Promise<void> {
    await this.loadEnhancedActivityData();
  }

  // 새로운 인사이트 관련 메서드
  hasHighPriorityInsights(): boolean {
    return this.smartInsights().some(insight => insight.priority === 'high');
  }

  getTopInsight(): SmartInsight | null {
    const insights = this.smartInsights();
    return insights.length > 0 ? insights[0] : null;
  }

  // HTML 템플릿에서 사용할 헬퍼 메서드
  getPatternWidth(totalActivities: number): number {
    return Math.min((totalActivities / 8) * 100, 100);
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
    
    if (percentage >= 80) return '#3182ce'; // 매우 활발
    if (percentage >= 60) return '#4299e1'; // 활발
    if (percentage >= 40) return '#63b3ed'; // 보통
    if (percentage >= 20) return '#90cdf4'; // 낮음
    if (percentage > 0) return '#bee3f8';   // 매우 낮음
    return '#e2e8f0'; // 활동 없음
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
}