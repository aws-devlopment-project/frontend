// SimplifiedActivityService.ts
import { Injectable, signal } from '@angular/core';
import { UserService } from '../../Core/Service/UserService';
import { GroupService } from '../../Core/Service/GroupService';

// 핵심 이벤트만 추적
interface CoreActivity {
  id: string;
  type: 'quest_complete' | 'milestone'; // 퀘스트 완료와 중요한 이정표만
  title: string;
  date: string;
  points: number;
  context?: {
    groupName?: string;
    questName?: string;
  };
}

// 간단한 일일 기록
interface DayRecord {
  date: string; // YYYY-MM-DD
  questsCompleted: number;
  hasActivity: boolean;
}

// 핵심 통계만
interface CoreStats {
  totalQuests: number;
  currentStreak: number;
  totalPoints: number;
  thisWeekQuests: number;
}

@Injectable({
  providedIn: 'root'
})
export class LocalActivityService {
  private readonly STORAGE_KEY = 'core_activities';
  private readonly STREAK_KEY = 'daily_records';
  private readonly MAX_ACTIVITIES = 50; // 최대 50개만 보관
  
  activities = signal<CoreActivity[]>([]);
  dailyRecords = signal<DayRecord[]>([]);
  
  constructor(
    private userService: UserService,
    private groupService: GroupService
  ) {
    this.loadFromStorage();
    this.initializeDailyRecords();
  }

  // === 핵심 이벤트만 추적 ===
  
  // 퀘스트 완료만 추적 (가장 중요한 이벤트)
  async trackQuestCompletion(groupName: string, questList: string[]): Promise<void> {
    const userCreds = await this.userService.getUserCredentials();
    if (!userCreds) return;

    const success = await this.userService.setUserQuestRecord(userCreds.id, groupName, questList);
    
    if (success) {
      // 여러 퀘스트를 하나의 활동으로 기록
      this.addCoreActivity(
        'quest_complete',
        `${questList.length}개 퀘스트 완료`,
        { groupName, questName: questList.join(', ') }
      );
      
      this.updateDailyRecord(questList.length);
    }
  }

  // 중요한 이정표만 추적 (첫 그룹 가입, 연속 기록 등)
  async trackMilestone(type: 'first_group' | 'streak_week' | 'streak_month', description: string): Promise<void> {
    this.addCoreActivity(
      'milestone',
      description,
      {}
    );
  }

  // === 핵심 통계만 제공 ===
  
  getCoreStats(): CoreStats {
    const activities = this.activities();
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const totalQuests = activities
      .filter(a => a.type === 'quest_complete')
      .reduce((sum, a) => sum + (a.context?.questName?.split(',').length || 1), 0);
    
    const thisWeekQuests = activities
      .filter(a => a.type === 'quest_complete' && new Date(a.date) >= weekAgo)
      .reduce((sum, a) => sum + (a.context?.questName?.split(',').length || 1), 0);
    
    const totalPoints = activities.reduce((sum, a) => sum + a.points, 0);
    const currentStreak = this.getCurrentStreak();

    return {
      totalQuests,
      currentStreak,
      totalPoints,
      thisWeekQuests
    };
  }

  // 간단한 주간 진행률만
  getWeeklyProgress(): { day: string; completed: number }[] {
    const today = new Date();
    const weekProgress = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = this.formatDate(date);
      
      const dayRecord = this.dailyRecords().find(r => r.date === dateStr);
      weekProgress.push({
        day: this.getDayName(date.getDay()),
        completed: dayRecord?.questsCompleted || 0
      });
    }
    
    return weekProgress;
  }

  // 간단한 인사이트 (3개만)
  getSimpleInsights(): string[] {
    const stats = this.getCoreStats();
    const insights: string[] = [];

    // 연속 활동
    if (stats.currentStreak >= 7) {
      insights.push(`🔥 ${stats.currentStreak}일 연속 활동 중!`);
    } else if (stats.currentStreak >= 3) {
      insights.push(`✨ ${stats.currentStreak}일 연속, 좋은 흐름이에요!`);
    }

    // 이번 주 성과
    if (stats.thisWeekQuests >= 10) {
      insights.push(`🎯 이번 주 ${stats.thisWeekQuests}개 퀘스트 완료!`);
    } else if (stats.thisWeekQuests >= 5) {
      insights.push(`📈 이번 주 꾸준한 활동 중이에요!`);
    }

    // 전체 성과
    if (stats.totalQuests >= 50) {
      insights.push(`🏆 총 ${stats.totalQuests}개 퀘스트 달성!`);
    }

    // 기본 격려 메시지
    if (insights.length === 0) {
      insights.push('🌱 오늘도 새로운 도전을 시작해보세요!');
    }

    return insights.slice(0, 3); // 최대 3개만
  }

  // === 내부 메서드들 ===
  
  private addCoreActivity(type: CoreActivity['type'], title: string, context: any): void {
    const points = type === 'quest_complete' ? 10 : 20;
    
    const activity: CoreActivity = {
      id: this.generateId(),
      type,
      title,
      date: this.formatDate(new Date()),
      points,
      context
    };

    const currentActivities = this.activities();
    const newActivities = [activity, ...currentActivities].slice(0, this.MAX_ACTIVITIES);
    
    this.activities.set(newActivities);
    this.saveToStorage();
  }

  private updateDailyRecord(questsCompleted: number): void {
    const today = this.formatDate(new Date());
    const records = this.dailyRecords();
    
    const updatedRecords = records.map(record => {
      if (record.date === today) {
        return {
          ...record,
          questsCompleted: record.questsCompleted + questsCompleted,
          hasActivity: true
        };
      }
      return record;
    });
    
    this.dailyRecords.set(updatedRecords);
    this.saveDailyRecords();
  }

  private getCurrentStreak(): number {
    const records = this.dailyRecords();
    let streak = 0;
    
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].hasActivity) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  }

  private initializeDailyRecords(): void {
    const existingRecords = this.loadDailyRecords();
    const today = new Date();
    const records: DayRecord[] = [];
    
    // 최근 30일만 기록
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = this.formatDate(date);
      
      const existingRecord = existingRecords.find(r => r.date === dateStr);
      records.push(existingRecord || {
        date: dateStr,
        questsCompleted: 0,
        hasActivity: false
      });
    }
    
    this.dailyRecords.set(records);
    this.saveDailyRecords();
  }

  // === 자동 이정표 체크 (간소화) ===
  
  async checkAndTrackMilestones(): Promise<void> {
    const stats = this.getCoreStats();
    
    // 일주일 연속 체크
    if (stats.currentStreak === 7) {
      await this.trackMilestone('streak_week', '일주일 연속 활동 달성!');
    }
    
    // 한 달 연속 체크
    if (stats.currentStreak === 30) {
      await this.trackMilestone('streak_month', '한 달 연속 활동 달성!');
    }
  }

  // === 유틸리티 ===
  
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getDayName(dayIndex: number): string {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[dayIndex];
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // === 스토리지 ===
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.activities.set(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load activities:', error);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.activities()));
    } catch (error) {
      console.error('Failed to save activities:', error);
    }
  }

  private loadDailyRecords(): DayRecord[] {
    try {
      const stored = localStorage.getItem(this.STREAK_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load daily records:', error);
      return [];
    }
  }

  private saveDailyRecords(): void {
    try {
      localStorage.setItem(this.STREAK_KEY, JSON.stringify(this.dailyRecords()));
    } catch (error) {
      console.error('Failed to save daily records:', error);
    }
  }

  // === 기존 호환성을 위한 간단한 메서드들 ===
  
  getRecentActivities(limit: number = 5): CoreActivity[] {
    return this.activities().slice(0, limit);
  }

  getTodayProgress(): { completed: number; hasActivity: boolean } {
    const today = this.formatDate(new Date());
    const todayRecord = this.dailyRecords().find(r => r.date === today);
    return {
      completed: todayRecord?.questsCompleted || 0,
      hasActivity: todayRecord?.hasActivity || false
    };
  }

  getWeeklyStats(): { totalQuests: number; activeDays: number; averageDaily: number } {
    const weeklyProgress = this.getWeeklyProgress();
    const totalQuests = weeklyProgress.reduce((sum, day) => sum + day.completed, 0);
    const activeDays = weeklyProgress.filter(day => day.completed > 0).length;
    const averageDaily = activeDays > 0 ? Math.round(totalQuests / activeDays) : 0;

    return { totalQuests, activeDays, averageDaily };
  }
}