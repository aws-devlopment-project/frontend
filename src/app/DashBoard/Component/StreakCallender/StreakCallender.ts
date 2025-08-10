// StreakCalendar.ts - 퀘스트 중심 개선 버전
import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';

interface DailyQuest {
  id: string;
  title: string;
  groupName: string;
  isCompleted: boolean;
  priority: 'high' | 'medium' | 'low';
  dueTime?: string;
}

interface CalendarDay {
  date: string;
  dayOfMonth: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  quests: DailyQuest[];
  completedCount: number;
  totalCount: number;
  completionRate: number; // 0-100
}

interface CalendarWeek {
  days: CalendarDay[];
}

@Component({
  selector: 'app-streak-calendar',
  templateUrl: './StreakCallender.html',
  styleUrl: './StreakCallender.css',
  imports: [CommonModule, MatIconModule, MatTooltipModule, MatDialogModule],
  standalone: true
})
export class StreakCalendarComponent {
  @Input() questData: { date: string; quests: DailyQuest[] }[] = [];
  @Input() currentStreak: number = 0;
  @Input() longestStreak: number = 0;
  
  @Output() questClick = new EventEmitter<{ quest: DailyQuest; date: string }>();
  @Output() dayClick = new EventEmitter<{ date: string; quests: DailyQuest[] }>();

  currentDate = signal(new Date());
  
  weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  constructor(private dialog: MatDialog) {}

  currentMonthTitle = computed(() => {
    const date = this.currentDate();
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  });

  calendarWeeks = computed(() => {
    const date = this.currentDate();
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 41);
    
    const weeks: CalendarWeek[] = [];
    const today = new Date();
    
    for (let weekStart = new Date(startDate); weekStart <= endDate; weekStart.setDate(weekStart.getDate() + 7)) {
      const days: CalendarDay[] = [];
      
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDay = new Date(weekStart);
        currentDay.setDate(currentDay.getDate() + dayOffset);
        
        const dateStr = this.formatDate(currentDay);
        const dayQuests = this.getQuestsForDate(dateStr);
        const completedCount = dayQuests.filter(q => q.isCompleted).length;
        const totalCount = dayQuests.length;
        const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        
        days.push({
          date: dateStr,
          dayOfMonth: currentDay.getDate(),
          isToday: this.isSameDay(currentDay, today),
          isCurrentMonth: currentDay.getMonth() === month,
          quests: dayQuests,
          completedCount,
          totalCount,
          completionRate
        });
      }
      
      weeks.push({ days });
    }
    
    return weeks;
  });

  private getQuestsForDate(date: string): DailyQuest[] {
    const questData = this.questData.find(d => d.date === date);
    return questData?.quests || [];
  }

  previousMonth(): void {
    const current = this.currentDate();
    const newDate = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    this.currentDate.set(newDate);
  }

  nextMonth(): void {
    const current = this.currentDate();
    const newDate = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    this.currentDate.set(newDate);
  }

  canGoPrevious(): boolean {
    const current = this.currentDate();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return current > threeMonthsAgo;
  }

  canGoNext(): boolean {
    const current = this.currentDate();
    const today = new Date();
    return current.getMonth() < today.getMonth() || current.getFullYear() < today.getFullYear();
  }

  getDayTooltip(day: CalendarDay): string {
    if (day.totalCount === 0) {
      return `${day.date}: 퀘스트 없음`;
    }
    
    const statusText = day.completedCount === day.totalCount ? '모든 퀘스트 완료!' : 
                      day.completedCount > 0 ? `${day.completedCount}/${day.totalCount} 완료` :
                      '미완료 퀘스트 있음';
    
    return `${day.date}: ${statusText}`;
  }

  onDayClick(day: CalendarDay): void {
    if (day.totalCount > 0) {
      this.dayClick.emit({ date: day.date, quests: day.quests });
    }
  }

  onQuestClick(event: Event, quest: DailyQuest, date: string): void {
    event.stopPropagation(); // 날짜 클릭 이벤트와 구분
    this.questClick.emit({ quest, date });
  }

  getCompletionColorClass(completionRate: number): string {
    if (completionRate === 100) return 'completion-perfect';
    if (completionRate >= 75) return 'completion-high';
    if (completionRate >= 50) return 'completion-medium';
    if (completionRate > 0) return 'completion-low';
    return 'completion-none';
  }

  getPriorityIcon(priority: string): string {
    switch (priority) {
      case 'high': return '🔥';
      case 'medium': return '⭐';
      case 'low': return '💡';
      default: return '📋';
    }
  }

  getVisibleQuests(quests: DailyQuest[], maxVisible: number = 2): DailyQuest[] {
    // 우선순위 순으로 정렬하여 표시
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return quests
      .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
      .slice(0, maxVisible);
  }

  getHiddenQuestCount(quests: DailyQuest[], maxVisible: number = 2): number {
    return Math.max(0, quests.length - maxVisible);
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.toDateString() === date2.toDateString();
  }
}