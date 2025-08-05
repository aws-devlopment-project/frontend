import { Component, signal, OnInit, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { HomeDashboardService } from "../../Service/HomeDashboard";
import { Router } from "@angular/router";
import { DebugService } from "../../../Debug/DebugService";

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

@Component({
  selector: 'app-home-dashboard',
  templateUrl: './HomeDashboard.html',
  styleUrl: './HomeDashboard.css',
  imports: [CommonModule, MatIconModule],
  providers: [HomeDashboardService],
  standalone: true
})
export class HomeDashboardComponent implements OnInit {
  // 현재 시간
  currentTime = signal(new Date());

  // SharedService에서 사용자 정보 가져오기
  userName = computed(() => {
    const user = this.sharedState.currentUser();
    return user?.name || '사용자';
  });

  // 사용자 ID (필요한 경우)
  userId = computed(() => {
    const user = this.sharedState.currentUser();
    return user?.id;
  });

  // 사용자 이메일 (필요한 경우)
  userEmail = computed(() => {
    const user = this.sharedState.currentUser();
    return user?.name;
  });

  // 빠른 통계
  quickStats = signal<QuickStat[]>([
    {
      id: '1',
      title: '오늘 달성률',
      value: '85%',
      change: '+12%',
      trend: 'up',
      icon: 'trending_up',
      color: '#48bb78'
    },
    {
      id: '2', 
      title: '참여 모임',
      value: '5개',
      change: '+2개',
      trend: 'up',
      icon: 'message',
      color: '#3182ce'
    },
    {
      id: '3',
      title: '연속 달성',
      value: '7일',
      change: '최고 기록!',
      trend: 'up',
      icon: 'local_fire_department',
      color: '#ed8936'
    }
  ]);

  // 빠른 액션
  quickActions = signal<QuickAction[]>([
    {
      id: '1',
      title: '모임',
      description: '모임에서 대화를 나눠보세요',
      icon: 'chat',
      route: '/chat',
      color: '#ed8936'
    },
    {
      id: '2',
      title: '새로운 모임 탐색',
      description: '관심있는 새로운 모임을 찾아보세요',
      icon: 'add_circle',
      route: '/browse',
      color: '#48bb78'
    },
    {
      id: '3',
      title: '내 통계 보기',
      description: '상세한 진행 상황과 분석을 확인하세요',
      icon: 'analytics',
      route: '/dashboard',
      color: '#805ad5'
    }
  ]);

  // 오늘의 하이라이트 (사용자 정보 반영)
  highlights = computed<HighlightItem[]>(() => {
    const user = this.sharedState.currentUser();
    return [
      {
        id: '1',
        type: 'achievement',
        title: '🎉 7일 연속 달성 달성!',
        description: '꾸준함의 힘으로 새로운 기록을 세우셨네요!',
        badge: '달성',
        time: '방금 전'
      },
      {
        id: '2',
        type: 'member',
        title: '이영희님이 운동 퀘스트 완료',
        description: '30분 러닝으로 오늘 목표를 달성했습니다',
        time: '5분 전',
        avatar: '🏃‍♀️'
      },
      {
        id: '3',
        type: 'challenge',
        title: '독서 퀘스트가 인기급상승',
        description: '이번 주 가장 많은 참여자가 몰리고 있습니다',
        badge: 'HOT',
        time: '1시간 전'
      }
    ];
  });

  // 추천 퀘스트
  recommendedChallenges = signal<RecommendedChallenge[]>([
    {
      id: '1',
      title: '미라클 모닝 퀘스트',
      description: '매일 아침 6시 기상으로 하루를 활기차게 시작해보세요',
      participants: 1234,
      difficulty: 'medium',
      category: '라이프스타일',
      image: '🌅'
    },
    {
      id: '2', 
      title: '30일 독서 퀘스트',
      description: '한 달 동안 매일 30분씩 독서하는 습관 만들기',
      participants: 892,
      difficulty: 'easy',
      category: '자기계발',
      image: '📚'
    },
    {
      id: '3',
      title: '플랭크 30일 퀘스트',
      description: '매일 플랭크 시간을 늘려가며 코어 근력 강화하기',
      participants: 567,
      difficulty: 'hard',
      category: '운동',
      image: '💪'
    }
  ]);

  constructor(public sharedState: SharedStateService, private router: Router, private homeDashboardService:HomeDashboardService, private debugService: DebugService) {
  }

  async ngOnInit(): Promise<void> {
    // 실시간 시간 업데이트
    setInterval(() => {
      this.currentTime.set(new Date());
    }, 60000); // 1분마다 업데이트
    // 사용자 정보가 로드되지 않았다면 로딩 상태 확인
    this.quickStats.set(await this.homeDashboardService.getTodayBoard());
    this.recommendedChallenges.set(await this.homeDashboardService.getRecommendedChallenge());
    this.debugService.printConsole(this.recommendedChallenges);
    if (!this.sharedState.currentUser()) {
      this.debugService.printConsole('User not loaded yet, waiting for user data...');
    }
  }

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
      case 'medium': return '#ed8936';
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

  onQuickAction(action: QuickAction): void {
    this.debugService.printConsole('Quick action clicked:', action.route);
    
    // SharedState를 통한 네비게이션
    switch (action.route) {
      case '/challenge':
        this.sharedState.setActiveTab('group');
        break;
      case '/browse':
        this.router.navigate(['/group/join']);
        break;
      case '/chat':
        this.sharedState.setActiveTab('group');
        break;
      case '/dashboard':
        this.sharedState.setActiveTab('activity');
        break;
      default:
        this.debugService.printConsole('Unknown route:', action.route);
    }
  }

  onJoinChallenge(challenge: RecommendedChallenge): void {
    this.debugService.printConsole('Join challenge:', challenge.id);
    this.sharedState.setSelectedGroup(challenge.category);
    this.sharedState.setSelectedChannel(null);
    this.sharedState.setActiveTab('group');
  }

  onViewAllChallenges(): void {
    this.debugService.printConsole('View all challenges');
    // 전체 챌린지 페이지로 이동
    this.sharedState.setActiveTab('group');
  }

  onViewAllHighlights(): void {
    this.debugService.printConsole('View all highlights');
    // 전체 활동 피드 페이지로 이동
    this.sharedState.setActiveTab('activity');
  }

  // 사용자 정보 로딩 상태 확인
  isUserLoaded(): boolean {
    return this.sharedState.currentUser() !== null;
  }

  // 사용자 아바타 이니셜 생성
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