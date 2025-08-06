import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

interface CalendarDay {
  date: string;
  value: number;
  level: number;
  dayOfMonth: number;
  isToday: boolean;
  isCurrentMonth: boolean;
}

interface CalendarWeek {
  days: CalendarDay[];
}

@Component({
  selector: 'app-streak-calendar',
  templateUrl: './StreakCallender.html',
  styleUrl: './StreakCallender.css',
  imports: [CommonModule, MatIconModule],
  standalone: true
})
export class StreakCalendarComponent {
  @Input() heatmapData: { date: string; value: number; level: number }[] = [];
  @Input() currentStreak: number = 0;
  @Input() longestStreak: number = 0;

  currentDate = signal(new Date());
  
  weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  
  legendLevels = [
    { value: 0, label: '없음' },
    { value: 1, label: '적음' },
    { value: 2, label: '보통' },
    { value: 3, label: '많음' },
    { value: 4, label: '매우 많음' }
  ];

  currentMonthTitle = computed(() => {
    const date = this.currentDate();
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  });

  calendarWeeks = computed(() => {
    const date = this.currentDate();
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // 해당 월의 첫째 날과 마지막 날
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 달력 시작일 (월요일부터 시작하는 주의 일요일)
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    // 달력 종료일 (6주 표시)
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
        const heatmapDay = this.heatmapData.find(d => d.date === dateStr);
        
        days.push({
          date: dateStr,
          value: heatmapDay?.value || 0,
          level: heatmapDay?.level || 0,
          dayOfMonth: currentDay.getDate(),
          isToday: this.isSameDay(currentDay, today),
          isCurrentMonth: currentDay.getMonth() === month
        });
      }
      
      weeks.push({ days });
    }
    
    return weeks;
  });

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
    // 3개월 전까지만 허용
    const current = this.currentDate();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return current > threeMonthsAgo;
  }

  canGoNext(): boolean {
    // 현재 달까지만 허용
    const current = this.currentDate();
    const today = new Date();
    return current.getMonth() < today.getMonth() || current.getFullYear() < today.getFullYear();
  }

  getDayTooltip(day: CalendarDay): string {
    if (day.value === 0) {
      return `${day.date}: 활동 없음`;
    }
    return `${day.date}: ${day.value}포인트 획득`;
  }

  onDayClick(day: CalendarDay): void {
    if (day.value > 0) {
      console.log(`${day.date}의 활동 상세 보기`);
      // 해당 날짜의 상세 활동 모달 등을 열 수 있음
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.toDateString() === date2.toDateString();
  }
}