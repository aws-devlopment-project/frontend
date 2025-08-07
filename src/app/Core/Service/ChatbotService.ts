// ChatbotService.ts - 완전한 활동 데이터 기반 개선된 챗봇 서비스
import { Injectable } from '@angular/core';
import { LocalActivityService } from '../../DashBoard/Service/LocalActivityService';

export interface ChatbotMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  animated?: boolean;
}

export interface MacroResponse {
  id: string;
  keywords: string[];
  patterns: string[];
  response: string;
  followUp?: string[];
  category: 'group' | 'quest' | 'general' | 'help' | 'stats' | 'achievement';
  confidence: number;
  contextualConditions?: (context: any) => boolean;
}

export interface UserActivityContext {
  hasJoinedGroups: boolean;
  activeTab: string;
  selectedGroup: string | null;
  selectedChannel: string | null;
  userName?: string;
  initialized: boolean;
  // LocalActivityService 데이터
  activityStats?: {
    totalActivities: number;
    totalPoints: number;
    streakCount: number;
    longestStreak: number;
    mostActiveDay: string;
  };
  questStats?: {
    currentQuests: number;
    completedQuests: number;
    completionRate: number;
    favoriteGroup: string;
  };
  groupStats?: {
    totalGroups: number;
    totalClubs: number;
    mostActiveGroup: string;
    recentlyJoinedGroup: string;
  };
  recentActivities?: any[];
  personalizedInsights?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  private readonly macroResponses: MacroResponse[] = [
    // === 기본 그룹/퀘스트 관련 (기존) ===
    {
      id: 'group_join',
      keywords: ['그룹', '참여', '가입', '들어가기'],
      patterns: ['그룹에 어떻게', '가입하려면', '참여하고 싶어'],
      response: '좌측 사이드바에서 "그룹 참여하기" 버튼을 클릭하거나, 홈 화면에서 그룹 목록을 확인하세요!',
      followUp: ['다른 궁금한 점이 있나요?'],
      category: 'group',
      confidence: 0.9
    },
    {
      id: 'quest_how',
      keywords: ['퀘스트', '미션', '목표', '달성'],
      patterns: ['퀘스트 어떻게', '목표 설정', '미션 완료'],
      response: '각 그룹마다 일일/주간 퀘스트가 있어요. 그룹 대시보드에서 오늘의 미션을 확인하고 체크해보세요!',
      followUp: ['퀘스트 관련해서 더 궁금한 게 있나요?'],
      category: 'quest',
      confidence: 0.85
    },

    // === 활동 통계 관련 (신규) ===
    {
      id: 'stats_overall',
      keywords: ['통계', '진행', '활동', '얼마나', '수치'],
      patterns: ['통계 보여줘', '얼마나 활동', '진행상황', '나의 기록'],
      response: '',
      followUp: ['더 자세한 통계가 궁금하시면 "상세 통계" 탭을 확인해보세요!'],
      category: 'stats',
      confidence: 0.9,
      contextualConditions: (context) => context.activityStats?.totalActivities > 0
    },
    {
      id: 'streak_info',
      keywords: ['연속', '스트릭', '연달아', '며칠', '꾸준히'],
      patterns: ['몇일 연속', '연속으로 얼마나', '스트릭은', '꾸준히 했나'],
      response: '',
      followUp: ['연속 기록을 늘려보세요! 💪'],
      category: 'achievement',
      confidence: 0.85,
      contextualConditions: (context) => context.activityStats?.streakCount > 0
    },
    {
      id: 'quest_completion_rate',
      keywords: ['퀘스트', '완료율', '달성률', '성공률', '얼마나 완료'],
      patterns: ['퀘스트 완료율', '얼마나 달성', '성공률은'],
      response: '',
      followUp: ['더 높은 달성률을 위해 꾸준히 도전해보세요!'],
      category: 'quest',
      confidence: 0.9,
      contextualConditions: (context) => context.questStats?.completionRate !== undefined
    },
    {
      id: 'favorite_group',
      keywords: ['좋아하는', '자주', '즐겨', '선호', '가장', '많이'],
      patterns: ['가장 좋아하는 그룹', '자주 가는 그룹', '선호하는 그룹'],
      response: '',
      followUp: ['해당 그룹에서 더 많은 활동을 해보시는 건 어떨까요?'],
      category: 'group',
      confidence: 0.8,
      contextualConditions: (context) => context.questStats?.favoriteGroup && context.questStats.favoriteGroup !== '없음'
    },
    {
      id: 'recent_activity',
      keywords: ['최근', '요즘', '근래', 'lately', '최근에'],
      patterns: ['최근에 뭐했나', '요즘 활동', '근래 어떤'],
      response: '',
      followUp: ['오늘도 새로운 도전을 해보시는 건 어떨까요?'],
      category: 'general',
      confidence: 0.8,
      contextualConditions: (context) => context.recentActivities?.length > 0
    },

    // === 동기부여 및 개인화 응답 (신규) ===
    {
      id: 'motivation_low_activity',
      keywords: ['동기', '의욕', '힘들어', '지쳐', '포기'],
      patterns: ['동기부여', '의욕이 없어', '힘들어서', '지쳐서'],
      response: '',
      followUp: ['작은 목표부터 시작해보세요. 당신은 할 수 있어요! 💪'],
      category: 'help',
      confidence: 0.7,
      contextualConditions: (context) => context.activityStats?.streakCount < 3
    },
    {
      id: 'congratulations_high_streak',
      keywords: ['자랑', '칭찬', '잘했', '대단', '축하'],
      patterns: ['잘하고 있나', '대단한가', '칭찬해줘'],
      response: '',
      followUp: ['이 기세로 계속 해보세요! 🎉'],
      category: 'achievement',
      confidence: 0.8,
      contextualConditions: (context) => context.activityStats?.streakCount >= 7
    },

    // === 기존 헬프 및 일반 ===
    {
      id: 'general_help',
      keywords: ['도움', '도와줘', '모르겠어', '헬프'],
      patterns: ['도움이 필요', '어떻게 해야', '모르겠'],
      response: '무엇을 도와드릴까요? "그룹 가입", "퀘스트", "통계 보기" 등에 대해 물어보세요!',
      followUp: ['구체적으로 어떤 부분이 궁금하신가요?'],
      category: 'help',
      confidence: 0.7
    }
  ];

  constructor(private activityService: LocalActivityService) {}

  // === 메인 응답 생성 (개선됨) ===
  async generateResponseWithActivity(input: string, userContext: UserActivityContext): Promise<string> {
    // 빈 입력 처리
    if (!input.trim()) {
      return this.getPersonalizedGreeting(userContext);
    }

    try {
      // 활동 데이터가 있으면 컨텍스트 보강
      const enrichedContext = await this.enrichContextWithActivity(userContext);

      // 1단계: 활동 기반 키워드 매칭
      let match = await this.keywordMatchWithActivity(input, enrichedContext);
      
      // 2단계: 패턴 매칭
      if (!match || match.confidence < 0.8) {
        const patternResult = this.patternMatch(input);
        if (patternResult && (!match || patternResult.confidence > match.confidence)) {
          match = patternResult;
        }
      }
      
      // 3단계: 유사도 매칭
      if (!match || match.confidence < 0.6) {
        const similarityResult = this.similarityMatch(input);
        if (similarityResult && (!match || similarityResult.confidence > match.confidence)) {
          match = similarityResult;
        }
      }
      
      // 응답 생성
      if (match && match.confidence > 0.4) {
        return this.generateContextualResponse(match, enrichedContext);
      }
      
      // 기본 응답 (개인화)
      return this.getPersonalizedDefaultResponse(enrichedContext);
    } catch (error) {
      console.error('Error generating response with activity:', error);
      return this.getPersonalizedGreeting(userContext);
    }
  }

  // === 활동 데이터 기반 응답 생성 ===
  private async keywordMatchWithActivity(input: string, context: UserActivityContext): Promise<MacroResponse | null> {
    const inputLower = input.toLowerCase();
    
    for (const macro of this.macroResponses) {
      const keywordScore = macro.keywords.filter(keyword => 
        inputLower.includes(keyword.toLowerCase())
      ).length;
      
      if (keywordScore > 0) {
        // 컨텍스트 조건 확인
        if (macro.contextualConditions && !macro.contextualConditions(context)) {
          continue;
        }
        
        return { ...macro, confidence: keywordScore / macro.keywords.length };
      }
    }
    return null;
  }

  private generateContextualResponse(macro: MacroResponse, context: UserActivityContext): string {
    // 매크로별 동적 응답 생성
    switch (macro.id) {
      case 'stats_overall':
        return this.generateStatsResponse(context);
      
      case 'streak_info':
        return this.generateStreakResponse(context);
      
      case 'quest_completion_rate':
        return this.generateQuestStatsResponse(context);
      
      case 'favorite_group':
        return this.generateFavoriteGroupResponse(context);
      
      case 'recent_activity':
        return this.generateRecentActivityResponse(context);
      
      case 'motivation_low_activity':
        return this.generateMotivationResponse(context);
      
      case 'congratulations_high_streak':
        return this.generateCongratulationsResponse(context);
      
      default:
        return macro.response;
    }
  }

  private generateStatsResponse(context: UserActivityContext): string {
    const stats = context.activityStats;
    if (!stats) return '아직 활동 데이터가 없어요. 새로운 활동을 시작해보세요! 🌱';

    return `📊 **활동 통계**
• 총 활동: **${stats.totalActivities}번**
• 획득 포인트: **${stats.totalPoints}점**
• 현재 연속: **${stats.streakCount}일**
• 최장 연속: **${stats.longestStreak}일**
• 가장 활발한 요일: **${stats.mostActiveDay}요일**

정말 꾸준히 활동하고 계시네요! 👏`;
  }

  private generateStreakResponse(context: UserActivityContext): string {
    const streak = context.activityStats?.streakCount || 0;
    const longest = context.activityStats?.longestStreak || 0;

    if (streak === 0) {
      return '🔥 아직 연속 기록이 없어요. 오늘부터 새로운 연속을 시작해보세요!';
    } else if (streak >= 7) {
      return `🔥 대단해요! **${streak}일 연속**으로 활동하고 계시네요!\n최장 기록은 **${longest}일**입니다. 이 기록을 깨보시는 건 어떨까요? 🏆`;
    } else {
      return `🔥 현재 **${streak}일 연속** 활동 중이에요!\n최장 기록은 **${longest}일**이에요. 조금만 더 힘내보세요! 💪`;
    }
  }

  private generateQuestStatsResponse(context: UserActivityContext): string {
    const quest = context.questStats;
    if (!quest) return '퀘스트 정보를 불러올 수 없어요. 잠시 후 다시 시도해보세요.';

    const completionRate = quest.completionRate;
    let emoji = '📈';
    let message = '';

    if (completionRate >= 90) {
      emoji = '🏆';
      message = '완벽해요!';
    } else if (completionRate >= 70) {
      emoji = '🎯';
      message = '훌륭해요!';
    } else if (completionRate >= 50) {
      emoji = '📊';
      message = '좋은 페이스에요!';
    } else {
      emoji = '🌱';
      message = '조금씩 늘려가요!';
    }

    return `${emoji} **퀘스트 달성률: ${completionRate}%** ${message}
• 현재 퀘스트: **${quest.currentQuests}개**
• 완료된 퀘스트: **${quest.completedQuests}개**
• 선호 그룹: **${quest.favoriteGroup}**`;
  }

  private generateFavoriteGroupResponse(context: UserActivityContext): string {
    const favoriteGroup = context.questStats?.favoriteGroup || context.groupStats?.mostActiveGroup;
    
    if (!favoriteGroup || favoriteGroup === '없음') {
      return '아직 특별히 선호하는 그룹이 없으시네요. 다양한 그룹에서 활동해보세요! 🌟';
    }

    return `🌟 **"${favoriteGroup}"** 그룹에서 가장 활발히 활동하고 계시네요!\n해당 그룹의 다른 멤버들과도 더 많이 소통해보시는 건 어떨까요? 🤝`;
  }

  private generateRecentActivityResponse(context: UserActivityContext): string {
    const activities = context.recentActivities;
    if (!activities || activities.length === 0) {
      return '최근 활동이 없어요. 오늘 새로운 도전을 시작해보시는 건 어떨까요? ✨';
    }

    const recentActivity = activities[0];
    const activityCount = activities.length;

    return `📝 최근에 **${activityCount}개의 활동**을 하셨네요!
가장 최근: **${recentActivity.title}**

${this.getEncouragementMessage(activityCount)} 🎉`;
  }

  private generateMotivationResponse(context: UserActivityContext): string {
    const streak = context.activityStats?.streakCount || 0;
    const total = context.activityStats?.totalActivities || 0;

    if (total === 0) {
      return '🌱 모든 시작이 그렇듯, 첫 걸음이 가장 중요해요!\n작은 퀘스트 하나부터 시작해보시는 건 어떨까요? 당신은 분명 해낼 수 있어요! 💪';
    } else if (streak < 3) {
      return `💪 지금까지 **${total}번의 활동**을 하셨어요!\n연속 기록을 쌓아가는 재미도 느껴보세요. 오늘 하나만 더 도전해볼까요? 🎯`;
    }

    return '🌟 때로는 쉬어가는 것도 필요해요. 부담갖지 마시고, 준비가 되면 언제든 다시 시작하세요! 😊';
  }

  private generateCongratulationsResponse(context: UserActivityContext): string {
    const streak = context.activityStats?.streakCount || 0;
    const points = context.activityStats?.totalPoints || 0;

    if (streak >= 30) {
      return `🏆 **${streak}일 연속!** 정말 대단한 끈기에요!\n당신은 진정한 목표 달성 마스터입니다! **${points}포인트**도 획득하셨고요. 👑`;
    } else if (streak >= 14) {
      return `🎉 **2주 연속!** 놀라운 꾸준함이에요!\n이런 습관이 있다면 어떤 목표든 달성할 수 있을 거예요! **${points}포인트** 축하드려요! 🌟`;
    } else if (streak >= 7) {
      return `🔥 **일주일 연속!** 정말 잘하고 있어요!\n이 습관을 계속 유지한다면 더 큰 성취를 이룰 수 있을 거예요! **${points}포인트**도 쌓였네요! 🎯`;
    }

    return `✨ **${streak}일 연속** 정말 대단해요! 이런 꾸준함이 성공의 비결이죠! 🌟`;
  }

  // === 개인화된 인사말 및 응답 ===
  private getPersonalizedGreeting(context: UserActivityContext): string {
    const userName = context.userName || '사용자';
    const streak = context.activityStats?.streakCount || 0;
    const hasGroups = context.hasJoinedGroups;
    
    const timeOfDay = this.getTimeOfDay();
    const greeting = `${timeOfDay} ${userName}님! 😊`;

    if (streak >= 7) {
      return `${greeting}\n🔥 ${streak}일 연속 활동 중! 오늘도 멋진 하루 보내세요!`;
    } else if (hasGroups && streak > 0) {
      return `${greeting}\n💪 ${streak}일째 꾸준히 활동하고 계시네요! 무엇을 도와드릴까요?`;
    } else if (hasGroups) {
      return `${greeting}\n🌟 오늘은 어떤 새로운 도전을 해보시겠어요?`;
    } else {
      return `${greeting}\n🎯 아직 참여한 그룹이 없으시네요. "그룹 가입"에 대해 물어보시면 도와드릴게요!`;
    }
  }

  private getPersonalizedDefaultResponse(context: UserActivityContext): string {
    const insights = context.personalizedInsights;
    if (insights && insights.length > 0) {
      const randomInsight = insights[Math.floor(Math.random() * insights.length)];
      return `${randomInsight}\n\n다른 질문이 있으시면 "그룹", "퀘스트", "통계" 같은 키워드로 물어보세요! 🤖`;
    }

    const defaultResponses = [
      '죄송해요, 잘 이해하지 못했어요. "통계", "퀘스트", "그룹" 등으로 물어보세요! 😅',
      '좀 더 구체적으로 말씀해 주세요. 아래 빠른 질문 버튼을 사용해보시는 건 어떨까요? 🤖',
      '아직 그 질문에 대한 답변을 준비하지 못했어요. 다른 것을 물어보시겠어요? 💭'
    ];
    
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
  }

  // === 활동 데이터 컨텍스트 보강 ===
  private async enrichContextWithActivity(context: UserActivityContext): Promise<UserActivityContext> {
    try {
      // 기본 활동 통계는 동기로 가져올 수 있음
      const activityStats = this.activityService.getActivityStats();
      const recentActivities = this.activityService.activities().slice(0, 5);

      // 비동기 데이터는 에러 핸들링과 함께
      const [questStats, groupStats, insights] = await Promise.allSettled([
        this.activityService.getQuestBasedStats(),
        this.activityService.getGroupParticipationStats(),
        this.activityService.getPersonalizedInsights()
      ]);

      return {
        ...context,
        activityStats,
        questStats: questStats.status === 'fulfilled' ? questStats.value : undefined,
        groupStats: groupStats.status === 'fulfilled' ? groupStats.value : undefined,
        recentActivities,
        personalizedInsights: insights.status === 'fulfilled' ? insights.value : []
      };
    } catch (error) {
      console.error('Error enriching context with activity data:', error);
      // 기본 컨텍스트 반환
      return {
        ...context,
        activityStats: this.activityService?.getActivityStats() || undefined,
        recentActivities: this.activityService?.activities()?.slice(0, 5) || []
      };
    }
  }

  // === 유틸리티 메서드들 ===
  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return '좋은 아침이에요!';
    if (hour < 18) return '안녕하세요!';
    return '좋은 저녁이에요!';
  }

  private getEncouragementMessage(activityCount: number): string {
    if (activityCount >= 10) return '정말 활발하게 활동하고 계시네요!';
    if (activityCount >= 5) return '꾸준히 잘 하고 계세요!';
    return '좋은 시작이에요!';
  }

  // === 기존 메서드들 유지 ===
  
  // 1단계: 키워드 매칭 (빠른 응답)
  private keywordMatch(input: string): MacroResponse | null {
    const inputLower = input.toLowerCase();
    
    for (const macro of this.macroResponses) {
      const keywordScore = macro.keywords.filter(keyword => 
        inputLower.includes(keyword.toLowerCase())
      ).length;
      
      if (keywordScore > 0) {
        return { ...macro, confidence: keywordScore / macro.keywords.length };
      }
    }
    return null;
  }

  // 2단계: 패턴 매칭 (문맥 고려)
  private patternMatch(input: string): MacroResponse | null {
    const inputLower = input.toLowerCase();
    
    for (const macro of this.macroResponses) {
      for (const pattern of macro.patterns) {
        if (this.fuzzyMatch(inputLower, pattern.toLowerCase())) {
          return { ...macro, confidence: 0.8 };
        }
      }
    }
    return null;
  }

  // 3단계: 유사도 기반 매칭 (ML 대안)
  private similarityMatch(input: string): MacroResponse | null {
    let bestMatch: MacroResponse | null = null;
    let bestScore = 0;

    for (const macro of this.macroResponses) {
      const combinedText = [...macro.keywords, ...macro.patterns].join(' ');
      const similarity = this.calculateSimilarity(input.toLowerCase(), combinedText.toLowerCase());
      
      if (similarity > bestScore && similarity > 0.3) {
        bestScore = similarity;
        bestMatch = { ...macro, confidence: similarity };
      }
    }
    
    return bestMatch;
  }

  // 퍼지 매칭 (오타 허용)
  private fuzzyMatch(text: string, pattern: string): boolean {
    const threshold = 0.7;
    const similarity = this.calculateSimilarity(text, pattern);
    return similarity >= threshold;
  }

  // 단순 유사도 계산 (Jaccard 유사도)
  private calculateSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(/\s+/));
    const set2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  // 기존 호환성을 위한 메서드
  generateResponse(input: string): string {
    // 기본 응답 (활동 데이터 없이)
    if (!input.trim()) {
      return '안녕하세요! 무엇을 도와드릴까요? 😊';
    }

    let match = this.keywordMatch(input);
    
    if (!match || match.confidence < 0.8) {
      const patternResult = this.patternMatch(input);
      if (patternResult && (!match || patternResult.confidence > match.confidence)) {
        match = patternResult;
      }
    }
    
    if (!match || match.confidence < 0.6) {
      const similarityResult = this.similarityMatch(input);
      if (similarityResult && (!match || similarityResult.confidence > match.confidence)) {
        match = similarityResult;
      }
    }
    
    if (match && match.confidence > 0.4) {
      return match.response;
    }
    
    return this.getDefaultResponse();
  }

  getContextualResponse(input: string, userContext: any): string {
    const baseResponse = this.generateResponse(input);
    
    if (userContext?.hasJoinedGroups === false && input.includes('그룹')) {
      return baseResponse + '\n\n💡 아직 참여한 그룹이 없으시네요! 홈 화면에서 "그룹 참여하기" 버튼을 눌러보세요.';
    }
    
    if (userContext?.activeTab === 'group' && input.includes('퀘스트')) {
      return baseResponse + '\n\n📋 현재 그룹 페이지에 계시네요! 오늘의 퀘스트를 바로 확인해보세요.';
    }
    
    return baseResponse;
  }

  private getDefaultResponse(): string {
    const defaultResponses = [
      '죄송해요, 잘 이해하지 못했어요. 다시 말씀해 주시겠어요?',
      '좀 더 구체적으로 말씀해 주세요. "그룹 가입"이나 "퀘스트" 같은 키워드로 물어보세요!',
      '아직 그 질문에 대한 답변을 준비하지 못했어요. 다른 것을 물어보시겠어요?'
    ];
    
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
  }

  // 매크로 응답 동적 추가
  addMacroResponse(macro: MacroResponse): void {
    this.macroResponses.push(macro);
  }

  // 응답 품질 개선을 위한 학습 데이터 수집
  logInteraction(input: string, response: string, userFeedback?: 'helpful' | 'unhelpful'): void {
    console.log('Chatbot Interaction:', { input, response, userFeedback, timestamp: new Date() });
  }
}