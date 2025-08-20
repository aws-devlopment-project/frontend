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

  // generateEnhancedDailyQuests 메서드 개선 - 실제 데이터만 사용
  private async generateEnhancedDailyQuests(): Promise<DailyActivity[]> {
    try {
      // 🔧 실제 존재하는 데이터 소스만 가져오기
      const [userQuestCur, userQuestPrev] = await Promise.all([
        this.getUserQuestCur(), // 당일 진행중인 퀘스트
        this.getUserQuestPrev() // 어제까지의 완료된 퀘스트
      ]);
      
      const localActivities = this.localActivityService.activities();

      console.log('🎯 Current Quest Data (오늘):', userQuestCur);
      console.log('📚 Previous Quest Data (어제까지):', userQuestPrev);

      // 🔧 오늘 날짜와 요일 계산
      const today = new Date();
      const todayDayIndex = today.getDay(); // 0=일요일, 1=월요일, ...

      // 📊 요일별 퀘스트 현황 생성 (실제 데이터만)
      const enhancedQuests = ['일', '월', '화', '수', '목', '금', '토'].map((day, dayIndex) => {
        let completed = 0;
        let target = 0;
        let hasRealData = false;
        let questDetails = [];
        let dataSource = 'none';

        if (dayIndex === todayDayIndex) {
          // 🔥 오늘 데이터 = userQuestCur 활용 (실제 데이터만)
          if (userQuestCur?.curQuestTotalList?.length > 0) {
            const todayQuests = userQuestCur.curQuestTotalList;
            completed = todayQuests.filter((q: any) => q.success === true).length;
            target = todayQuests.length;
            hasRealData = true;
            questDetails = todayQuests;
            dataSource = 'userQuestCur';
            
            console.log(`📅 오늘(${day}) 실제 퀘스트:`, { completed, target, todayQuests });
          }
          
        } else if (dayIndex < todayDayIndex) {
          // 📚 과거 데이터 = userQuestPrev 활용 (실제 데이터만)
          if (userQuestPrev?.prevQuestTotalList?.length > 0) {
            const pastQuests = this.getQuestsForDay(userQuestPrev, dayIndex, today);
            if (pastQuests.totalCount > 0) {
              completed = pastQuests.completedCount;
              target = pastQuests.totalCount;
              hasRealData = true;
              questDetails = pastQuests.quests;
              dataSource = 'userQuestPrev';
              
              console.log(`📅 과거(${day}) 실제 퀘스트:`, { completed, target, quests: pastQuests.quests });
            }
          }
        }
        // 🚫 미래 데이터는 생성하지 않음 (예상 데이터 제거)

        // LocalActivity 데이터로 보완 (실제 완료된 활동만)
        const localDayActivities = localActivities.filter(activity => {
          const activityDay = new Date(activity.timestamp).getDay();
          return activityDay === dayIndex && activity.type === 'quest_complete';
        }).length;

        // 실제 데이터가 있는 경우에만 LocalActivity로 보완
        if (hasRealData && localDayActivities > completed) {
          completed = localDayActivities;
          console.log(`📅 ${day} LocalActivity로 보완:`, { original: completed, local: localDayActivities });
        }

        return {
          date: day,
          completed: completed,
          target: target,
          currentQuests: questDetails,
          hasRealData: hasRealData, // 실제 데이터 존재 여부
          isToday: dayIndex === todayDayIndex,
          isPast: dayIndex < todayDayIndex,
          isFuture: dayIndex > todayDayIndex,
          dataSource: dataSource,
          isEmpty: !hasRealData // 데이터 없음 표시
        };
      });

      console.log('📊 Real Data Only Weekly Quest Data:', enhancedQuests);
      return enhancedQuests;

    } catch (error) {
      console.error('❌ Error generating real daily quests:', error);
      return this.getEmptyDailyQuests();
    }
  }

  // 🔧 특정 요일의 과거 퀘스트 데이터 추출 (실제 데이터만)
  private getQuestsForDay(userQuestPrev: any, targetDayIndex: number, referenceDate: Date): {
    completedCount: number;
    totalCount: number;
    quests: any[];
  } {
    if (!userQuestPrev?.prevQuestTotalList || userQuestPrev.prevQuestTotalList.length === 0) {
      return { completedCount: 0, totalCount: 0, quests: [] };
    }

    // 이번 주 시작일 계산 (일요일 기준)
    const weekStart = new Date(referenceDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    
    // 타겟 날짜 계산
    const targetDate = new Date(weekStart);
    targetDate.setDate(weekStart.getDate() + targetDayIndex);

    // 해당 날짜의 퀘스트 필터링 (실제 완료 시간이 있는 것만)
    const dayQuests = userQuestPrev.prevQuestTotalList.filter((quest: any) => {
      if (!quest.completeTime) return false;
      
      const questDate = new Date(quest.completeTime);
      return questDate.toDateString() === targetDate.toDateString();
    });

    const completedCount = dayQuests.filter((q: any) => q.success === true).length;
    const totalCount = dayQuests.length;

    console.log(`📅 ${targetDate.toDateString()} 실제 퀘스트:`, {
      날짜: targetDate.toDateString(),
      전체: totalCount,
      완료: completedCount,
      퀘스트목록: dayQuests.map((q: any) => ({ quest: q.quest, success: q.success }))
    });

    return {
      completedCount,
      totalCount,
      quests: dayQuests
    };
  }

  // 🔧 빈 데이터 생성 (실제 데이터 없을 때)
  private getEmptyDailyQuests(): DailyActivity[] {
    const todayIndex = new Date().getDay();
    
    return ['일', '월', '화', '수', '목', '금', '토'].map((day, index) => ({
      date: day,
      completed: 0,
      target: 0,
      currentQuests: [],
      hasRealData: false,
      isToday: index === todayIndex,
      isPast: index < todayIndex,
      isFuture: index > todayIndex,
      dataSource: 'none',
      isEmpty: true
    }));
  }

  // 🔧 processEnhancedActivityData 메서드 개선 - 실제 데이터만 반영
  private processEnhancedActivityData(data: ActivityData): void {
    const localStats = data.personalizedStats?.localStats;

    // 🔧 실제 주간 퀘스트 현황 계산 (빈 데이터 제외)
    const weeklyQuests = data.dailyQuests || [];
    const daysWithData = weeklyQuests.filter((day: any) => day.hasRealData === true);
    
    const totalWeeklyQuests = daysWithData.reduce((sum, day: any) => sum + (day.target || 0), 0);
    const completedWeeklyQuests = daysWithData.reduce((sum, day: any) => sum + (day.completed || 0), 0);
    const weeklyCompletionRate = totalWeeklyQuests > 0 
      ? Math.round((completedWeeklyQuests / totalWeeklyQuests) * 100) 
      : 0;

    // 🔧 오늘 실제 진행상황 (데이터가 있을 때만)
    const todayData = weeklyQuests.find((day: any) => day.isToday === true && day.hasRealData === true);
    const todayProgress = todayData 
      ? `${todayData.completed}/${todayData.target}`
      : null; // 데이터 없으면 null

    // 🔧 데이터 존재 여부 기반 통계
    const dataExistsCount = daysWithData.length;
    const dataCompleteness = Math.round((dataExistsCount / 7) * 100);

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
        label: '오늘 진행',
        value: todayData?.completed || 0,
        unit: todayData ? `/${todayData.target}` : '',
        icon: 'today',
        color: '#4299e1',
        trend: todayData && todayData.completed >= todayData.target ? 'up' : 'stable',
        hasData: !!todayData // 데이터 존재 여부
      },
      {
        label: '완료율 (실제)',
        value: weeklyCompletionRate,
        unit: '%',
        icon: 'trending_up',
        color: '#2b6cb0',
        trend: weeklyCompletionRate >= 80 ? 'up' : weeklyCompletionRate >= 50 ? 'stable' : 'down',
        hasData: totalWeeklyQuests > 0
      },
      {
        label: '데이터 일수',
        value: dataExistsCount,
        unit: '/7일',
        icon: 'assessment',
        color: '#68d391',
        trend: dataExistsCount >= 5 ? 'up' : dataExistsCount >= 3 ? 'stable' : 'down',
        hasData: true
      }
    ];

    console.log('📊 Real Data Only Stats:', {
      totalWeeklyQuests,
      completedWeeklyQuests,
      weeklyCompletionRate,
      todayProgress,
      dataExistsCount,
      dataCompleteness
    });

    this.weeklyStats.set(weeklyStats);
    this.recentActivities.set(data.recentActivities || []);
  }

  // 🔧 loadEnhancedActivityData 메서드 - 실제 데이터만 로드
  private async loadEnhancedActivityData(): Promise<void> {
    this.isLoading.set(true);

    try {
      console.log('🔍 실제 데이터만 로딩 시작...');

      const [fundamentalData, getBestType, localStats, groupStats, insights] = await Promise.all([
        this.activityDashboardService.getQuestScore().catch(() => [0, 0, 0, 0]),
        this.activityDashboardService.getBestType().catch(() => ['', '']),
        this.localActivityService.getQuestBasedStats().catch(() => ({
          currentQuests: 0,
          completedQuests: 0,
          completionRate: 0,
          favoriteGroup: '없음',
          weeklyProgress: []
        })),
        this.localActivityService.getGroupParticipationStats().catch(() => ({
          totalGroups: 0,
          totalClubs: 0,
          mostActiveGroup: '없음',
          recentlyJoinedGroup: '없음',
          groupDetails: []
        })),
        this.localActivityService.getEnhancedPersonalizedInsights().catch(() => [{
          type: 'quest' as const,
          message: '🌱 새로운 활동을 시작해보세요!',
          priority: 'medium' as const,
          icon: '✨',
          suggestion: '첫 번째 퀘스트에 도전해보세요'
        }])
      ]);

      // 🔧 실제 데이터만으로 구성된 주간 데이터
      const inputData: ActivityData = {
        dailyQuests: await this.generateEnhancedDailyQuests(), // 실제 데이터만
        streak: Math.max(fundamentalData[0] || 0, this.localActivityService.getCurrentStreak()),
        totalCompleted: (fundamentalData[1] || 0) + localStats.completedQuests,
        monthlyAchievementRate: Math.max(fundamentalData[2] || 0, localStats.completionRate),
        recentActivities: this.generateBasicRecentActivities(), // 🔧 존재하는 메서드 사용
        weeklyPattern: await this.generateEnhancedWeeklyPattern().catch(() => []),
        favoriteQuestType: localStats.favoriteGroup || getBestType[0] || '없음',
        bestDay: getBestType[1] || '없음',
        smartInsights: insights,
        personalizedStats: {
          localStats,
          groupStats,
          activityStats: this.localActivityService.getActivityStats()
        }
      };

      console.log('📊 Real Data Only Activity Data:', inputData);
      this.activityData.set(inputData);
      this.processEnhancedActivityData(inputData);
      this.smartInsights.set(insights);

    } catch (error) {
      console.error('❌ Error loading real data only:', error);
      // 🔧 간단한 폴백 데이터 직접 설정
      const fallbackData: ActivityData = {
        dailyQuests: this.getEmptyDailyQuests(),
        streak: 0,
        totalCompleted: 0,
        monthlyAchievementRate: 0,
        recentActivities: this.generateBasicRecentActivities(),
        weeklyPattern: [],
        favoriteQuestType: '없음',
        bestDay: '없음',
        smartInsights: [],
        personalizedStats: null
      };
      this.activityData.set(fallbackData);
      this.processEnhancedActivityData(fallbackData);
    } finally {
      this.isLoading.set(false);
    }
  }

  // 🔧 getUserQuestPrev 메서드
  async getUserQuestPrev(): Promise<any> {
    try {
      const userService = this.activityDashboardService.userService;
      if (userService && userService.getUserQuestPrev) {
        return await userService.getUserQuestPrev();
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting userQuestPrev:', error);
      return null;
    }
  }

  // 🔧 getUserQuestCur 메서드
  async getUserQuestCur(): Promise<any> {
    try {
      const userService = this.activityDashboardService.userService;
      if (userService && userService.getUserQuestCur) {
        return await userService.getUserQuestCur();
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting userQuestCur:', error);
      return null;
    }
  }

  // 🔧 실제 데이터 존재 여부 확인 메서드들
  hasRealQuestData(): boolean {
    const data = this.activityData();
    const weeklyQuests = data?.dailyQuests || [];
    return weeklyQuests.some((day: any) => day.hasRealData === true);
  }

  getRealDataDays(): number {
    const data = this.activityData();
    const weeklyQuests = data?.dailyQuests || [];
    return weeklyQuests.filter((day: any) => day.hasRealData === true).length;
  }

  getWeeklyRealDataSummary(): string {
    const data = this.activityData();
    const weeklyQuests = data?.dailyQuests || [];
    const realDataDays = weeklyQuests.filter((day: any) => day.hasRealData === true);
    
    if (realDataDays.length === 0) {
      return '이번 주 퀘스트 데이터가 없습니다.';
    }
    
    const totalCompleted = realDataDays.reduce((sum: number, day: any) => sum + (day.completed || 0), 0);
    const totalTarget = realDataDays.reduce((sum: number, day: any) => sum + (day.target || 0), 0);
    const completionRate = totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0;
    
    return `${realDataDays.length}일간 ${totalTarget}개 퀘스트 중 ${totalCompleted}개 완료 (${completionRate}%)`;
  }

  // 🔧 요일별 실제 데이터 상세 정보
  getDayRealDataInfo(dayIndex: number): { 
    completed: number; 
    target: number; 
    hasRealData: boolean; 
    dataSource: string;
    isToday: boolean;
    isEmpty: boolean;
  } {
    const data = this.activityData();
    const dailyQuest = data?.dailyQuests?.[dayIndex];
    
    if (!dailyQuest || typeof dailyQuest !== 'object') {
      return { 
        completed: 0, 
        target: 0, 
        hasRealData: false, 
        dataSource: 'none',
        isToday: false,
        isEmpty: true
      };
    }
    
    const questData = dailyQuest as any;
    
    return {
      completed: questData.completed || 0,
      target: questData.target || 0,
      hasRealData: questData.hasRealData || false,
      dataSource: questData.dataSource || 'none',
      isToday: questData.isToday || false,
      isEmpty: questData.isEmpty || false
    };
  }

  // 🔧 데이터 소스별 표시 (실제 데이터만)
  getDataSourceText(dataSource: string): string {
    const textMap: { [key: string]: string } = {
      'userQuestCur': '진행중',
      'userQuestPrev': '완료됨',
      'none': '데이터 없음'
    };
    return textMap[dataSource] || '알 수 없음';
  }

  // 🔧 실제 데이터만으로 완료율 계산
  getRealDataCompletionRate(): number {
    const data = this.activityData();
    const weeklyQuests = data?.dailyQuests || [];
    const realDataDays = weeklyQuests.filter((day: any) => day.hasRealData === true);
    
    if (realDataDays.length === 0) return 0;
    
    const totalTarget = realDataDays.reduce((sum: number, day: any) => sum + (day.target || 0), 0);
    const totalCompleted = realDataDays.reduce((sum: number, day: any) => sum + (day.completed || 0), 0);
    
    return totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0;
  }

  // 🔧 오늘 실제 데이터 존재 여부
  hasTodayRealData(): boolean {
    const data = this.activityData();
    const todayData = data?.dailyQuests?.find((day: any) => day.isToday === true);
    return (todayData as any)?.hasRealData === true;
  }

  // 🔧 과거 실제 데이터 일수
  getPastRealDataDays(): number {
    const data = this.activityData();
    const weeklyQuests = data?.dailyQuests || [];
    return weeklyQuests.filter((day: any) => day.isPast === true && day.hasRealData === true).length;
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

  // 완료율 계산 개선 (null 체크 추가)
  getCompletionRate(): number {
    const data = this.activityData();
    if (!data || !data.dailyQuests || data.dailyQuests.length === 0) return 0;
    
    const totalTarget = data.dailyQuests.reduce((sum, day) => sum + (day.target || 0), 0);
    const totalCompleted = data.dailyQuests.reduce((sum, day) => sum + (day.completed || 0), 0);
    
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

  // 안전한 퍼센티지 계산 (0으로 나누기 방지 및 유효하지 않은 값 처리)
  getSafePercentage(completed: number, target: number): number {
    // null, undefined, 또는 0인 값들을 안전하게 처리
    const safeCompleted = completed || 0;
    const safeTarget = target || 0;
    
    if (safeTarget === 0) return 0;
    
    const percentage = (safeCompleted / safeTarget) * 100;
    
    // 100%를 초과하지 않도록 제한
    return Math.min(Math.max(percentage, 0), 100);
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