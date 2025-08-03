import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ActivityDashboardService } from "../../Service/ActivityDashboard";

interface ActivityItem {
  id: string;
  type: 'quest_completed' | 'milestone' | 'encouragement';
  title: string;
  description: string;
  timestamp: Date;
  icon: string;
  points?: number;
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

interface ActivityData {
  dailyQuests: DailyActivity[];
  streak: number;
  totalCompleted: number;
  monthlyAchievementRate: number;
  recentActivities: ActivityItem[];
  weeklyPattern: WeeklyPattern[];
  favoriteQuestType: string;
  bestDay: string;
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
  // 데이터 signals
  activityData = signal<ActivityData | null>(null);
  isLoading = signal<boolean>(true);
  selectedPeriod = signal<'week' | 'month'>('week');

  // 통계 signals
  weeklyStats = signal<any[]>([]);
  recentActivities = signal<ActivityItem[]>([]);

  constructor(private activityDashboardService: ActivityDashboardService) {}

  ngOnInit(): void {
    this.loadActivityData();
  }

  private async loadActivityData(): Promise<void> {
    this.isLoading.set(true);

    const fundementalData = await this.activityDashboardService.getQuestScore();
    const getBestType = await this.activityDashboardService.getBestType();
    const inputData: ActivityData = {
      dailyQuests: await this.generateDailyQuests(),
      streak: fundementalData[0],
      totalCompleted: fundementalData[1],
      monthlyAchievementRate: fundementalData[2],
      recentActivities: this.generateRecentActivities(),
      weeklyPattern: await this.generateWeeklyPattern(),
      favoriteQuestType: getBestType[0],
      bestDay: getBestType[1]
    };
    this.activityData.set(inputData);
    this.processActivityData(inputData);
    this.isLoading.set(false);
  }

  private async generateDailyQuests(): Promise<DailyActivity[]> {
    return await this.activityDashboardService.pastDailyComplete();
  }

  private generateRecentActivities(): ActivityItem[] {
    const activities: ActivityItem[] = [
      {
        id: '1',
        type: 'quest_completed',
        title: '물 마시기 퀘스트 완료',
        description: '2L 목표 달성! 건강한 하루를 보냈어요 💧',
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
        icon: '💧',
        points: 10
      },
      {
        id: '2',
        type: 'milestone',
        title: '연속 참여 10일 달성!',
        description: '꾸준한 노력으로 마일스톤을 달성했습니다',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
        icon: '🔥',
        points: 50
      },
      {
        id: '3',
        type: 'quest_completed',
        title: '독서 인증 완료',
        description: '오늘의 책: "습관의 힘" 30분 독서',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4),
        icon: '📚',
        points: 15
      },
      {
        id: '4',
        type: 'encouragement',
        title: '김철수님이 응원을 보냈어요',
        description: '"정말 대단해요! 저도 동기부여 받았습니다 👏"',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
        icon: '👏'
      },
      {
        id: '5',
        type: 'quest_completed',
        title: '계단 오르기 완료',
        description: '엘리베이터 대신 계단으로 10층까지!',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8),
        icon: '🚶',
        points: 8
      }
    ];

    return activities;
  }

  private async generateWeeklyPattern(): Promise<WeeklyPattern[]> {
    return await this.activityDashboardService.getWeeklyPattern();
  }

  private processActivityData(data: ActivityData): void {
    // 주간 통계 계산
    const weeklyStats = [
      {
        label: '연속 참여',
        value: data.streak,
        unit: '일',
        icon: 'local_fire_department',
        color: '#ff6b35'
      },
      {
        label: '총 완료',
        value: data.totalCompleted,
        unit: '개',
        icon: 'check_circle',
        color: '#4ecdc4'
      },
      {
        label: '주간 달성률',
        value: data.monthlyAchievementRate,
        unit: '%',
        icon: 'trending_up',
        color: '#45b7d1'
      },
      {
        label: '평균 점수',
        value: 8.5,
        unit: '점',
        icon: 'star',
        color: '#f7b731'
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
    switch (type) {
      case 'quest_completed': return '#4ecdc4';
      case 'milestone': return '#ff6b35';
      case 'encouragement': return '#a8e6cf';
      default: return '#ddd';
    }
  }

  getActivityTypeBadge(type: string): string {
    switch (type) {
      case 'quest_completed': return '완료';
      case 'milestone': return '달성';
      case 'encouragement': return '응원';
      default: return '';
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

  getCompletionRate(): number {
    const data = this.activityData();
    if (!data) return 0;
    
    const totalTarget = data.dailyQuests.reduce((sum, day) => sum + day.target, 0);
    const totalCompleted = data.dailyQuests.reduce((sum, day) => sum + day.completed, 0);
    
    return Math.round((totalCompleted / totalTarget) * 100);
  }

  getBestPerformanceDay(): string {
    const data = this.activityData();
    if (!data) return '';
    
    const bestDay = data.weeklyPattern.reduce((best, current) => 
      current.totalActivities > best.totalActivities ? current : best
    );
    
    return bestDay.day;
  }

  refreshData(): void {
    this.loadActivityData();
  }
}