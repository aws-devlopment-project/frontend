import { Injectable, signal } from '@angular/core';
import { DataCacheService } from '../../Core/Service/DataCacheService';
import { UserService } from '../../Core/Service/UserService';
import { GroupService } from '../../Core/Service/GroupService';
import { SharedStateService } from '../../Core/Service/SharedService';
import { UserCredentials, UserStatus, UserJoin, UserQuestCur, UserQuestPrev, UserQuestWeekly } from '../../Core/Models/user'
import { Group } from '../../Core/Models/group';
import { Club } from '../../Core/Models/club';

interface UserAction {
  id: string;
  type: 'page_visit' | 'quest_start' | 'quest_complete' | 'group_join' | 'club_join' | 'message_send' | 'search_action' | 'quest_view';
  title: string;
  description: string;
  timestamp: Date;
  context?: {
    groupName?: string;
    clubName?: string;
    questName?: string;
    questList?: string[];
    targetUser?: string;
  };
  points: number;
}

interface DailyStreak {
  date: string; // YYYY-MM-DD 형식
  activities: number;
  points: number;
  hasActivity: boolean;
  questsCompleted: number;
  groupsVisited: string[];
}

interface ActivityInsight {
  type: 'streak' | 'quest' | 'social' | 'achievement';
  message: string;
  priority: 'high' | 'medium' | 'low';
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocalActivityService {
  private readonly STORAGE_KEY = 'user_activity_history';
  private readonly STREAK_KEY = 'user_streak_data';
  private readonly MAX_ACTIVITIES = 200;
  
  activities = signal<UserAction[]>([]);
  streakData = signal<DailyStreak[]>([]);
  
  constructor(
    private cacheService: DataCacheService,
    private userService: UserService,
    private groupService: GroupService,
    private shared: SharedStateService
  ) {
    this.loadFromStorage();
    this.initializeStreakData();
  }

  // === 캐시 데이터 기반 활동 추적 ===
  
  // 퀘스트 완료 추적 (실제 UserQuestCur 데이터 기반)
  async trackQuestCompletion(groupName: string, questList: string[]): Promise<void> {
    const userCreds = await this.userService.getUserCredentials();
    if (!userCreds) return;

    // 실제 API 호출과 연동
    const success = await this.userService.setUserQuestRecord(userCreds.id, groupName, questList);
    
    if (success) {
      questList.forEach(quest => {
        this.trackActivity(
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
      
      // 연속 완료 체크
      await this.checkConsecutiveQuests(groupName, questList);
    }
  }

  // 그룹 가입 추적 (실제 UserJoin 업데이트와 연동)
  async trackGroupJoin(groupName: string): Promise<void> {
    const userCreds = await this.userService.getUserCredentials();
    if (!userCreds) return;

    const group = this.shared.groupList().filter((group) => group.name === groupName);
    const success = await this.userService.joinGroup(userCreds.id, group[0].id, groupName);
    
    if (success) {
      // 그룹 정보 가져오기
      const groupInfo = await this.groupService.getGroupInfo(groupName);
      
      this.trackActivity(
        'group_join',
        `${groupName} 그룹 가입`,
        `새로운 그룹 "${groupName}"에 가입했습니다. ${groupInfo ? `현재 ${groupInfo.memberNum}명의 멤버가 있습니다.` : ''}`,
        { groupName }
      );

      // 첫 그룹 가입인지 체크
      await this.checkFirstTimeJoins('group', groupName);
    }
  }

  // 클럽 가입 추적 (실제 UserJoin 업데이트와 연동)
  async trackClubJoin(groupName: string, clubList: string[]): Promise<void> {
    const userCreds = await this.userService.getUserCredentials();
    if (!userCreds) return;

    const success = await this.userService.joinClub(userCreds.id, groupName, clubList);
    
    if (success) {
      clubList.forEach(clubName => {
        this.trackActivity(
          'club_join',
          `${clubName} 채널 가입`,
          `${groupName} 그룹의 "${clubName}" 채널에 가입했습니다.`,
          { groupName, clubName }
        );
      });

      // 첫 클럽 가입인지 체크
      for (const clubName of clubList) {
        await this.checkFirstTimeJoins('club', clubName, groupName);
      }
    }
  }

  // 기본 활동 추적 (기존 방식 유지)
  trackActivity(type: UserAction['type'], title: string, description: string, context?: any): void {
    const points = this.calculatePoints(type, context);
    
    const activity: UserAction = {
      id: this.generateId(),
      type,
      title,
      description,
      timestamp: new Date(),
      context,
      points
    };

    const currentActivities = this.activities();
    const newActivities = [activity, ...currentActivities].slice(0, this.MAX_ACTIVITIES);
    
    this.activities.set(newActivities);
    this.updateStreakData(activity);
    this.saveToStorage(newActivities);
  }

  // === 캐시 데이터 기반 분석 ===

  // 실제 퀘스트 데이터 기반 통계
  async getQuestBasedStats(): Promise<{
    currentQuests: number;
    completedQuests: number;
    completionRate: number;
    favoriteGroup: string;
    weeklyProgress: { day: string; completed: number; total: number }[];
  }> {
    const userCreds = await this.userService.getUserCredentials();
    if (!userCreds) return this.getEmptyQuestStats();

    try {
      const [questCur, questWeekly] = await Promise.all([
        this.userService.getUserQuestCur(userCreds.id),
        this.userService.getUserQuestWeekly(userCreds.id)
      ]);

      const currentQuests = questCur?.curQuestTotalList.length || 0;
      const completedQuests = questCur?.curQuestTotalList.filter(q => q.isSuccess).length || 0;
      const completionRate = currentQuests > 0 ? Math.round((completedQuests / currentQuests) * 100) : 0;

      // 가장 참여도가 높은 그룹 찾기
      const groupStats: { [key: string]: number } = {};
      questCur?.curQuestTotalList.forEach(quest => {
        groupStats[quest.group] = (groupStats[quest.group] || 0) + (quest.isSuccess ? 1 : 0);
      });
      const favoriteGroup = Object.entries(groupStats)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || '없음';

      // 주간 진행률
      const weeklyProgress = questWeekly?.weeklyQuestList.map(week => ({
        day: this.getDayName(week.day),
        completed: week.successQuestNum,
        total: week.questTotalNum
      })) || [];

      return {
        currentQuests,
        completedQuests,
        completionRate,
        favoriteGroup,
        weeklyProgress
      };
    } catch (error) {
      console.error('Error getting quest stats:', error);
      return this.getEmptyQuestStats();
    }
  }

  // 실제 그룹 데이터 기반 참여 통계
  async getGroupParticipationStats(): Promise<{
    totalGroups: number;
    totalClubs: number;
    mostActiveGroup: string;
    recentlyJoinedGroup: string;
    groupDetails: { name: string; memberCount: number; questCount: number }[];
  }> {
    const userCreds = await this.userService.getUserCredentials();
    if (!userCreds) return this.getEmptyGroupStats();

    try {
      const joinList = await this.userService.getUserJoin(userCreds.id);
      if (!joinList) return this.getEmptyGroupStats();

      const totalGroups = joinList.joinList.length;
      const totalClubs = joinList.joinList.reduce((sum, group) => sum + group.clubList.length, 0);

      // 최근 활동이 많은 그룹 찾기 (로컬 활동 기록 기반)
      const groupActivityCounts: { [key: string]: number } = {};
      this.activities().forEach(activity => {
        if (activity.context?.groupName) {
          groupActivityCounts[activity.context.groupName] = 
            (groupActivityCounts[activity.context.groupName] || 0) + 1;
        }
      });

      const mostActiveGroup = Object.entries(groupActivityCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || joinList.joinList[0]?.groupname || '없음';

      // 최근 가입한 그룹 (가장 최근 group_join 활동)
      const recentGroupJoin = this.activities()
        .filter(a => a.type === 'group_join')
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
      const recentlyJoinedGroup = recentGroupJoin?.context?.groupName || '없음';

      // 그룹 상세 정보
      const groupDetails = await Promise.all(
        joinList.joinList.map(async (group) => {
          const groupInfo = await this.groupService.getGroupInfo(group.groupname);
          return {
            name: group.groupname,
            memberCount: groupInfo?.memberNum || 0,
            questCount: groupInfo?.questList.length || 0
          };
        })
      );

      return {
        totalGroups,
        totalClubs,
        mostActiveGroup,
        recentlyJoinedGroup,
        groupDetails
      };
    } catch (error) {
      console.error('Error getting group participation stats:', error);
      return this.getEmptyGroupStats();
    }
  }

  // 캐시 데이터 기반 개인화된 인사이트
  async getEnhancedPersonalizedInsights(): Promise<ActivityInsight[]> {
    const insights: ActivityInsight[] = [];
    
    try {
      // 퀘스트 기반 인사이트
      const questStats = await this.getQuestBasedStats();
      if (questStats.completionRate >= 80) {
        insights.push({
          type: 'achievement',
          message: `🎯 퀘스트 달성률 ${questStats.completionRate}%! 대단해요!`,
          priority: 'high',
          icon: '🏆'
        });
      }

      // 연속 활동 인사이트
      const currentStreak = this.getCurrentStreak();
      if (currentStreak >= 7) {
        insights.push({
          type: 'streak',
          message: `🔥 ${currentStreak}일 연속 활동! 멈출 수 없는 열정이네요!`,
          priority: 'high',
          icon: '🔥'
        });
      }

      // 그룹 참여 인사이트
      const groupStats = await this.getGroupParticipationStats();
      if (groupStats.totalGroups >= 3) {
        insights.push({
          type: 'social',
          message: `🤝 ${groupStats.totalGroups}개 그룹에서 활발히 활동 중이시네요!`,
          priority: 'medium',
          icon: '🌟'
        });
      }

      // 선호 활동 패턴 인사이트
      const activityPattern = this.getActivityTypeDistribution();
      const topActivityType = activityPattern[0];
      if (topActivityType && topActivityType.count >= 10) {
        const activityName = this.getActivityTypeName(topActivityType.type);
        insights.push({
          type: 'quest',
          message: `📊 ${activityName} 활동을 특히 좋아하시는군요!`,
          priority: 'medium',
          icon: '📈'
        });
      }

      return insights.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

    } catch (error) {
      console.error('Error getting enhanced insights:', error);
      return [{
        type: 'quest',
        message: '🌱 새로운 활동을 시작해보세요!',
        priority: 'low',
        icon: '✨'
      }];
    }
  }

  // === 연속성 및 성취 체크 ===

  private async checkConsecutiveQuests(groupName: string, questList: string[]): Promise<void> {
    const userCreds = await this.userService.getUserCredentials();
    if (!userCreds) return;

    try {
      const questContinuous = await this.userService.getUserQuestContinuous(userCreds.id);
      if (questContinuous && questContinuous.continuousSuccessQuestList.days >= 3) {
        this.trackActivity(
          'quest_complete',
          '연속 퀘스트 달성!',
          `${questContinuous.continuousSuccessQuestList.days}일 연속으로 퀘스트를 완료하고 있습니다!`,
          { groupName, questList }
        );
      }
    } catch (error) {
      console.error('Error checking consecutive quests:', error);
    }
  }

  private async checkFirstTimeJoins(type: 'group' | 'club', name: string, groupName?: string): Promise<void> {
    const userCreds = await this.userService.getUserCredentials();
    if (!userCreds) return;

    try {
      const joinList = await this.userService.getUserJoin(userCreds.id);
      if (!joinList) return;

      if (type === 'group' && joinList.joinList.length === 1) {
        this.trackActivity(
          'group_join',
          '첫 그룹 가입!',
          '축하합니다! 첫 번째 그룹에 가입하셨습니다. 새로운 여정이 시작됩니다!',
          { groupName: name }
        );
      } else if (type === 'club') {
        const totalClubs = joinList.joinList.reduce((sum, group) => sum + group.clubList.length, 0);
        if (totalClubs === 1) {
          this.trackActivity(
            'club_join',
            '첫 채널 가입!',
            '첫 번째 채널에 가입하셨습니다! 이제 다른 멤버들과 소통해보세요.',
            { groupName, clubName: name }
          );
        }
      }
    } catch (error) {
      console.error('Error checking first time joins:', error);
    }
  }

  // === 포인트 계산 개선 ===
  private calculatePoints(type: string, context?: any): number {
    const basePoints: { [key: string]: number } = {
      'page_visit': 1,
      'quest_start': 3,
      'quest_complete': 10,
      'group_join': 20,
      'club_join': 15,
      'message_send': 5,
      'search_action': 2,
      'quest_view': 2
    };

    let points = basePoints[type] || 1;

    // 컨텍스트 기반 보너스
    if (context?.questList && context.questList.length > 1) {
      points += (context.questList.length - 1) * 5; // 다중 퀘스트 완료 보너스
    }

    if (type === 'quest_complete') {
      const hour = new Date().getHours();
      if (hour >= 6 && hour <= 9) points += 2; // 아침 시간 보너스
      if (hour >= 22 || hour <= 5) points += 3; // 늦은 시간 완료 보너스
    }

    return points;
  }

  // === 유틸리티 메서드들 ===
  private getDayName(dayNumber: number): string {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[dayNumber] || '알 수 없음';
  }

  private getActivityTypeName(type: string): string {
    const typeNames: { [key: string]: string } = {
      'page_visit': '페이지 탐색',
      'quest_start': '퀘스트 시작',
      'quest_complete': '퀘스트 완료',
      'group_join': '그룹 참여',
      'club_join': '채널 참여',
      'message_send': '소통 활동',
      'search_action': '검색 활동',
      'quest_view': '퀘스트 조회'
    };
    return typeNames[type] || '일반 활동';
  }

  private getActivityTypeDistribution(): { type: string; count: number; percentage: number }[] {
    const activities = this.activities();
    const typeCounts: { [key: string]: number } = {};
    
    activities.forEach(activity => {
      typeCounts[activity.type] = (typeCounts[activity.type] || 0) + 1;
    });

    const total = activities.length;
    return Object.entries(typeCounts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

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

  // === 기존 메서드들 유지 ===
  
  // 스트릭 데이터 초기화 (기존 로직 유지)
  private initializeStreakData(): void {
    const existingData = this.loadStreakFromStorage();
    const today = new Date();
    const streakDays: DailyStreak[] = [];
    
    for (let i = 89; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = this.formatDate(date);
      
      const existingDay = existingData.find(d => d.date === dateStr);
      if (existingDay) {
        streakDays.push(existingDay);
      } else {
        streakDays.push({
          date: dateStr,
          activities: 0,
          points: 0,
          hasActivity: false,
          questsCompleted: 0,
          groupsVisited: []
        });
      }
    }
    
    this.streakData.set(streakDays);
    this.saveStreakToStorage(streakDays);
  }

  // 스트릭 데이터 업데이트 (개선됨)
  private updateStreakData(activity: UserAction): void {
    const dateStr = this.formatDate(activity.timestamp);
    const currentStreak = this.streakData();
    
    const updatedStreak = currentStreak.map(day => {
      if (day.date === dateStr) {
        const questsCompleted = activity.type === 'quest_complete' ? day.questsCompleted + 1 : day.questsCompleted;
        const groupsVisited = activity.context?.groupName && !day.groupsVisited.includes(activity.context.groupName)
          ? [...day.groupsVisited, activity.context.groupName]
          : day.groupsVisited;

        return {
          ...day,
          activities: day.activities + 1,
          points: day.points + activity.points,
          hasActivity: true,
          questsCompleted,
          groupsVisited
        };
      }
      return day;
    });
    
    this.streakData.set(updatedStreak);
    this.saveStreakToStorage(updatedStreak);
  }

  // 연속 활동 일수 계산 (기존 로직 유지)
  getCurrentStreak(): number {
    const streakData = this.streakData();
    let streak = 0;
    
    for (let i = streakData.length - 1; i >= 0; i--) {
      if (streakData[i].hasActivity) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  }

  // 최장 연속 기록 (기존 로직 유지)
  getLongestStreak(): number {
    const streakData = this.streakData();
    let maxStreak = 0;
    let currentStreak = 0;
    
    streakData.forEach(day => {
      if (day.hasActivity) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });
    
    return maxStreak;
  }

  // 기타 유틸리티 메서드들 (기존 유지)
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 스토리지 관련 메서드들 (기존 유지)
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const activities = JSON.parse(stored).map((a: any) => ({
          ...a,
          timestamp: new Date(a.timestamp)
        }));
        this.activities.set(activities);
      }
    } catch (error) {
      console.error('Failed to load activities from storage:', error);
    }
  }

  private saveToStorage(activities: UserAction[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(activities));
    } catch (error) {
      console.error('Failed to save activities to storage:', error);
    }
  }

  private loadStreakFromStorage(): DailyStreak[] {
    try {
      const stored = localStorage.getItem(this.STREAK_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load streak data from storage:', error);
      return [];
    }
  }

  private saveStreakToStorage(streakData: DailyStreak[]): void {
    try {
      localStorage.setItem(this.STREAK_KEY, JSON.stringify(streakData));
    } catch (error) {
      console.error('Failed to save streak data to storage:', error);
    }
  }

  // 기존 호환성을 위한 메서드들
  getActivityStats() {
    // 기존 인터페이스 유지
    const activities = this.activities();
    const streakData = this.streakData();
    
    const totalActivities = activities.length;
    const totalPoints = activities.reduce((sum, activity) => sum + activity.points, 0);
    
    const activeDays = streakData.filter(day => day.hasActivity);
    const averageDaily = activeDays.length > 0 ? Math.round(totalPoints / activeDays.length) : 0;
    
    const dayStats = new Array(7).fill(0);
    activities.forEach(activity => {
      const dayOfWeek = new Date(activity.timestamp).getDay();
      dayStats[dayOfWeek]++;
    });
    
    const mostActiveDayIndex = dayStats.indexOf(Math.max(...dayStats));
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const mostActiveDay = dayNames[mostActiveDayIndex];
    
    return {
      totalActivities,
      totalPoints,
      averageDaily,
      mostActiveDay,
      streakCount: this.getCurrentStreak(),
      longestStreak: this.getLongestStreak()
    };
  }

  getHeatmapData() {
    const streakData = this.streakData();
    const maxPoints = Math.max(...streakData.map(day => day.points));
    
    return streakData.map(day => ({
      date: day.date,
      value: day.points,
      level: this.calculateHeatmapLevel(day.points, maxPoints)
    }));
  }

  getWeeklyStreakData() {
    const streakData = this.streakData();
    const weeks: { week: string; days: DailyStreak[] }[] = [];
    
    const recentDays = streakData.slice(-28);
    
    for (let i = 0; i < 4; i++) {
      const weekStart = i * 7;
      const weekEnd = weekStart + 7;
      const weekDays = recentDays.slice(weekStart, weekEnd);
      
      if (weekDays.length === 7) {
        const startDate = new Date(weekDays[0].date);
        const endDate = new Date(weekDays[6].date);
        
        weeks.push({
          week: `${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}`,
          days: weekDays
        });
      }
    }
    
    return weeks;
  }

  async getPersonalizedInsights(): Promise<string[]> {
    // 기존 인터페이스를 위해 문자열 배열로 반환
    return await this.getEnhancedPersonalizedInsights().then(insights => 
      insights.map(insight => insight.message)
    ).catch(() => ['🌱 새로운 활동을 시작해보세요!']);
  }

  private calculateHeatmapLevel(points: number, maxPoints: number): number {
    if (points === 0) return 0;
    if (maxPoints === 0) return 1;
    
    const percentage = (points / maxPoints) * 100;
    if (percentage <= 25) return 1;
    if (percentage <= 50) return 2;
    if (percentage <= 75) return 3;
    return 4;
  }
}