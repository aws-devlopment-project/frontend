import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

interface Quest {
  id: string;
  title: string;
  description: string;
  icon: string;
  progress: number;
  status: 'pending' | 'in-progress' | 'completed';
}

interface Stat {
  id: string;
  label: string;
  value: number;
  icon: string;
  unit: string;
}

@Component({
  selector: 'app-group-dashboard',
  templateUrl: './GroupDashboard.html',
  styleUrl: './GroupDashboard.css',
  imports: [CommonModule, MatIconModule],
  standalone: true
})
export class GroupDashboardComponent implements OnInit {
  // 일일 퀘스트 데이터
  quests = signal<Quest[]>([
    {
      id: '1',
      title: '운동하기',
      description: '30분 이상 운동하고 인증샷 올리기',
      icon: '💪',
      progress: 75,
      status: 'in-progress'
    },
    {
      id: '2',
      title: '독서하기',
      description: '하루 30페이지 이상 책 읽기',
      icon: '📚',
      progress: 100,
      status: 'completed'
    },
    {
      id: '3',
      title: '물 마시기',
      description: '하루 2L 이상 물 마시기',
      icon: '💧',
      progress: 60,
      status: 'in-progress'
    }
  ]);

  // 통계 데이터
  stats = signal<Stat[]>([
    { id: '1', label: '전체 멤버', value: 156, icon: 'group', unit: '명' },
    { id: '2', label: '퀘스트 달성률', value: 75, icon: 'thumb_up', unit: '%' },
    { id: '3', label: '소모임 수', value: 78, icon: 'star', unit: '개' }
  ]);

  ngOnInit(): void {
    // 진행률 애니메이션을 위한 초기화
    setTimeout(() => this.animateProgress(), 500);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return '#48bb78';
      case 'in-progress': return '#4299e1';
      case 'pending': return '#a0aec0';
      default: return '#a0aec0';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'completed': return '완료';
      case 'in-progress': return '진행중';
      case 'pending': return '대기중';
      default: return '알 수 없음';
    }
  }

  onQuestAction(): void {
    console.log('Quest action clicked');
    // 퀘스트 인증 모달 열기
  }

  onActivityView(): void {
    console.log('Activity view clicked');
    // 소모임 활동 페이지 열기
  }

  private animateProgress(): void {
    // 진행률 바 애니메이션 구현
    const progressBars = document.querySelectorAll('.quest-progress-bar') as NodeListOf<HTMLElement>;
    progressBars.forEach((bar, index) => {
      const targetWidth = bar.getAttribute('data-progress') + '%';
      bar.style.width = '0%';
      
      setTimeout(() => {
        bar.style.width = targetWidth;
        bar.style.transition = 'width 0.8s ease-out';
      }, index * 200);
    });
  }
}