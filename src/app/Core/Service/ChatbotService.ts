// ChatbotService.ts - 기존 파일에 Q&A 기능 통합한 개선 버전
import { Injectable } from '@angular/core';
import { LocalActivityService } from '../../DashBoard/Service/LocalActivityService';

export interface ChatbotMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  animated?: boolean;
  feedback?: 'helpful' | 'unhelpful' | null;
  showFeedback?: boolean;
  feedbackProvided?: boolean;
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

// === Q&A 관련 인터페이스 ===
interface QAItem {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  confidence: number;
}

interface QASearchResult {
  item: QAItem;
  score: number;
  matchType: 'exact' | 'keyword' | 'semantic' | 'fuzzy';
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  private readonly macroResponses: MacroResponse[] = [
    // === 기본 그룹/퀘스트 관련 (기존 유지) ===
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

  // === Q&A 지식 베이스 ===
  private knowledgeBase: QAItem[] = [];
  private keywordIndex: Map<string, QAItem[]> = new Map();
  private qaInitialized = false;

  constructor(private activityService: LocalActivityService) {
    this.initializeQAKnowledge();
  }

  // === Q&A 시스템 초기화 ===
  private async initializeQAKnowledge(): Promise<void> {
    try {
      // assets 폴더에서 Q&A 파일 로드 시도
      const response = await fetch('/assets/chatbot-qa.txt');
      if (response.ok) {
        const qaContent = await response.text();
        await this.loadQAFile(qaContent);
      } else {
        // 파일이 없으면 기본 Q&A 데이터 사용
        this.loadDefaultQAData();
      }
    } catch (error) {
      console.warn('Q&A 파일을 로드할 수 없어 기본 데이터를 사용합니다:', error);
      this.loadDefaultQAData();
    }
  }

  // 기본 Q&A 데이터 (파일이 없을 때 대체용)
  private loadDefaultQAData(): void {
    const defaultQAData = `
[Question]
그룹에 어떻게 가입하나요?

[Answer]
좌측 사이드바의 "그룹 참여하기" 버튼을 클릭하거나, 홈 화면에서 관심 있는 그룹을 선택하여 가입할 수 있습니다. 가입 후에는 해당 그룹의 퀘스트와 채널에 참여할 수 있어요!

[Question]
퀘스트 완료가 안됩니다

[Answer]
퀘스트 완료 버튼을 클릭한 후 잠시 기다려보세요. 네트워크 상태가 불안정하면 완료 처리가 지연될 수 있습니다. 계속 문제가 발생하면 페이지를 새로고침해보세요.

[Question]
통계는 어디서 볼 수 있나요?

[Answer]
좌측 메뉴에서 "통계" 탭을 클릭하면 자세한 활동 통계를 확인할 수 있습니다. 연속 기록, 포인트, 완료한 퀘스트 등을 한눈에 볼 수 있어요!

[Question]
연속 기록이 끊어졌어요

[Answer]
연속 기록은 매일 최소 1개 이상의 활동(퀘스트 완료, 그룹 참여 등)을 해야 유지됩니다. 하루라도 활동이 없으면 리셋되지만, 새로운 연속 기록을 다시 시작할 수 있어요! 💪

[Question]
채널에 참여하는 방법

[Answer]
그룹에 가입한 후, 해당 그룹 페이지에서 원하는 채널을 선택하여 참여할 수 있습니다. 각 채널은 다양한 주제로 나뉘어져 있어요.

[Question]
점수가 안 올라가요

[Answer]
활동 완료 후 점수 반영까지 최대 1-2분 정도 걸릴 수 있습니다. 페이지를 새로고침해보시거나, "통계 보여줘"로 현재 상태를 확인해보세요.
`;

    try {
      this.loadQAFile(defaultQAData);
    } catch (error) {
      console.error('기본 Q&A 데이터 로드 실패:', error);
    }
  }

  // Q&A 파일 로드 및 파싱
  private async loadQAFile(fileContent: string): Promise<void> {
    try {
      const qaItems = this.parseQAFile(fileContent);
      const processedItems = qaItems.map(item => this.preprocessQAItem(item));
      
      this.knowledgeBase = processedItems;
      this.buildKeywordIndex();
      this.qaInitialized = true;
    } catch (error) {
      console.error('Failed to load Q&A file:', error);
      throw error;
    }
  }

  // Q&A 텍스트 파일 파싱
  private parseQAFile(content: string): { question: string; answer: string }[] {
    const qaItems: { question: string; answer: string }[] = [];
    
    // 정규표현식으로 [Question]과 [Answer] 섹션 분리
    const sections = content.split(/\[Question\]|\[Answer\]/i).filter(section => section.trim());
    
    for (let i = 0; i < sections.length; i += 2) {
      const question = sections[i]?.trim();
      const answer = sections[i + 1]?.trim();
      
      if (question && answer) {
        qaItems.push({ question, answer });
      }
    }
    
    return qaItems;
  }

  // Q&A 아이템 전처리
  private preprocessQAItem(item: { question: string; answer: string }): QAItem {
    const keywords = this.extractKeywords(item.question);
    const category = this.categorizeQuestion(item.question);
    
    return {
      id: this.generateId(),
      question: item.question,
      answer: item.answer,
      keywords,
      category,
      confidence: 1.0
    };
  }

  // 키워드 추출
  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['은', '는', '이', '가', '을', '를', '에', '에서', '와', '과', '의', '도', '만', '부터', '까지', '으로', '로', '한다', '하다', '이다', '있다', '없다', '것', '수', '때', '곳', '분', '년', '월', '일']);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word))
      .slice(0, 10);
  }

  // 질문 카테고리 분류
  private categorizeQuestion(question: string): string {
    const categoryKeywords = {
      'group': ['그룹', '참여', '가입', '멤버', '팀'],
      'quest': ['퀘스트', '미션', '목표', '달성', '완료'],
      'stats': ['통계', '기록', '수치', '진행', '점수'],
      'help': ['도움', '방법', '어떻게', '사용법', '가이드'],
      'technical': ['오류', '버그', '문제', '안됨', '작동'],
      'channel': ['채널', '클럽', '방', '채팅']
    };

    const questionLower = question.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => questionLower.includes(keyword))) {
        return category;
      }
    }
    
    return 'general';
  }

  // 키워드 인덱스 구축
  private buildKeywordIndex(): void {
    this.keywordIndex.clear();
    
    this.knowledgeBase.forEach(item => {
      item.keywords.forEach(keyword => {
        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, []);
        }
        this.keywordIndex.get(keyword)!.push(item);
      });
    });
  }

  // === 메인 응답 생성 (Q&A 통합 개선 버전) ===
  async generateResponseWithActivity(input: string, userContext: UserActivityContext): Promise<string> {
    if (!input.trim()) {
      return this.getPersonalizedGreeting(userContext);
    }

    try {
      // 활동 데이터 컨텍스트 보강
      const enrichedContext = await this.enrichContextWithActivity(userContext);

      // 1단계: Q&A 지식 베이스 검색 (최우선)
      const qaResults = this.searchQA(input, 3);
      if (qaResults.length > 0 && qaResults[0].score > 0.7) {
        const bestMatch = qaResults[0];
        return this.personalizeQAResponse(bestMatch.item.answer, enrichedContext);
      }

      // 2단계: 기존 매크로 응답 (활동 기반)
      let match = await this.keywordMatchWithActivity(input, enrichedContext);
      
      // 3단계: 패턴 매칭
      if (!match || match.confidence < 0.8) {
        const patternResult = this.patternMatch(input);
        if (patternResult && (!match || patternResult.confidence > match.confidence)) {
          match = patternResult;
        }
      }
      
      // 4단계: Q&A 보조 검색 (낮은 점수라도 참고)
      if (!match || match.confidence < 0.6) {
        if (qaResults.length > 0 && qaResults[0].score > 0.4) {
          const qaMatch = qaResults[0];
          return this.personalizeQAResponse(qaMatch.item.answer, enrichedContext) + 
                 '\n\n💡 더 정확한 답변이 필요하시면 구체적으로 질문해주세요!';
        }
      }
      
      // 5단계: 유사도 매칭
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
      
      // 기본 응답 (Q&A 제안 포함)
      return this.getEnhancedDefaultResponse(input, enrichedContext, qaResults);
    } catch (error) {
      console.error('Error generating response with Q&A:', error);
      return this.getPersonalizedGreeting(userContext);
    }
  }

  // === Q&A 검색 메서드 ===
  private searchQA(query: string, limit: number = 5): QASearchResult[] {
    if (!this.qaInitialized || this.knowledgeBase.length === 0) {
      return [];
    }

    const results: QASearchResult[] = [];
    
    // 1. 정확한 매칭
    const exactMatches = this.findExactMatches(query);
    results.push(...exactMatches);
    
    // 2. 키워드 매칭
    if (results.length < limit) {
      const keywordMatches = this.findKeywordMatches(query);
      results.push(...keywordMatches.filter(r => !results.some(existing => existing.item.id === r.item.id)));
    }
    
    // 3. 의미적 유사도 매칭
    if (results.length < limit) {
      const semanticMatches = this.findSemanticMatches(query);
      results.push(...semanticMatches.filter(r => !results.some(existing => existing.item.id === r.item.id)));
    }
    
    // 4. 퍼지 매칭
    if (results.length < limit) {
      const fuzzyMatches = this.findFuzzyMatches(query);
      results.push(...fuzzyMatches.filter(r => !results.some(existing => existing.item.id === r.item.id)));
    }
    
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // 정확한 매칭
  private findExactMatches(query: string): QASearchResult[] {
    const queryLower = query.toLowerCase().trim();
    
    return this.knowledgeBase
      .filter(item => 
        item.question.toLowerCase().includes(queryLower) ||
        queryLower.includes(item.question.toLowerCase())
      )
      .map(item => ({
        item,
        score: 1.0,
        matchType: 'exact' as const
      }));
  }

  // 키워드 매칭
  private findKeywordMatches(query: string): QASearchResult[] {
    const queryKeywords = this.extractKeywords(query);
    const matches: Map<string, { item: QAItem; matchCount: number }> = new Map();
    
    queryKeywords.forEach(keyword => {
      const items = this.keywordIndex.get(keyword) || [];
      items.forEach(item => {
        const existing = matches.get(item.id);
        if (existing) {
          existing.matchCount++;
        } else {
          matches.set(item.id, { item, matchCount: 1 });
        }
      });
    });
    
    return Array.from(matches.values())
      .map(({ item, matchCount }) => ({
        item,
        score: Math.min(matchCount / queryKeywords.length, 1.0) * 0.8,
        matchType: 'keyword' as const
      }))
      .filter(result => result.score > 0.2);
  }

  // 의미적 유사도 매칭
  private findSemanticMatches(query: string): QASearchResult[] {
    const queryWords = new Set(this.extractKeywords(query));
    
    return this.knowledgeBase
      .map(item => {
        const itemWords = new Set(item.keywords);
        const intersection = new Set([...queryWords].filter(word => itemWords.has(word)));
        const union = new Set([...queryWords, ...itemWords]);
        
        const similarity = intersection.size / union.size;
        
        return {
          item,
          score: similarity * 0.6,
          matchType: 'semantic' as const
        };
      })
      .filter(result => result.score > 0.1);
  }

  // 퍼지 매칭
  private findFuzzyMatches(query: string): QASearchResult[] {
    const queryLower = query.toLowerCase();
    
    return this.knowledgeBase
      .map(item => {
        const similarity = this.calculateStringSimilarity(queryLower, item.question.toLowerCase());
        
        return {
          item,
          score: similarity * 0.4,
          matchType: 'fuzzy' as const
        };
      })
      .filter(result => result.score > 0.2);
  }

  // 문자열 유사도 계산
  private calculateStringSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    
    const intersection = new Set([...set1].filter(char => set2.has(char)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  // === 응답 개인화 메서드 ===
  private personalizeQAResponse(qaAnswer: string, context: UserActivityContext): string {
    const userName = context.userName || '사용자';
    const streak = context.activityStats?.streakCount || 0;
    
    let personalizedAnswer = qaAnswer;
    
    // 컨텍스트 기반 개인화
    if (streak >= 7) {
      personalizedAnswer += `\n\n🔥 ${userName}님은 ${streak}일 연속 활동 중이시네요! 대단해요!`;
    }
    
    if (context.questStats && context.questStats?.completionRate >= 80) {
      personalizedAnswer += `\n\n🎯 퀘스트 달성률 ${context.questStats.completionRate}%로 정말 열심히 하고 계시네요!`;
    }
    
    if (!context.hasJoinedGroups) {
      personalizedAnswer += '\n\n💡 아직 그룹에 참여하지 않으셨네요. 그룹 가입을 통해 더 많은 기능을 이용해보세요!';
    }
    
    return personalizedAnswer;
  }

  // 향상된 기본 응답
  private getEnhancedDefaultResponse(
    input: string, 
    context: UserActivityContext, 
    qaResults: QASearchResult[]
  ): string {
    const suggestions = qaResults
      .filter(result => result.score > 0.2)
      .slice(0, 2)
      .map(result => `"${result.item.question}"`)
      .join(' 또는 ');

    const baseResponse = this.getPersonalizedDefaultResponse(context);
    
    if (suggestions) {
      return `${baseResponse}\n\n🤔 혹시 이런 질문을 하신 건가요?\n${suggestions}\n\n더 구체적으로 질문해주시면 정확한 답변을 드릴 수 있어요!`;
    }
    
    return baseResponse;
  }

  // === 학습 및 관리 기능 ===
  
  // 사용자 피드백으로부터 학습
  learnFromInteraction(input: string, response: string, feedback: 'helpful' | 'unhelpful', correction?: string): void {
    
    if (feedback === 'unhelpful' && correction) {
      // 새로운 Q&A 추가
      this.addQA(input, correction);
    }
    
    // 로그 데이터 수집 (향후 분석용)
    this.logInteraction(input, response, feedback);
  }

  // Q&A 동적 추가
  addQA(question: string, answer: string): void {
    const newItem = this.preprocessQAItem({ question, answer });
    this.knowledgeBase.push(newItem);
    
    // 키워드 인덱스 업데이트
    newItem.keywords.forEach(keyword => {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, []);
      }
      this.keywordIndex.get(keyword)!.push(newItem);
    });
  }

  // Q&A 통계 조회
  getQAStats() {
    const categoryCounts: { [key: string]: number } = {};
    this.knowledgeBase.forEach(item => {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });

    return {
      totalItems: this.knowledgeBase.length,
      categories: categoryCounts,
      keywordIndexSize: this.keywordIndex.size,
      initialized: this.qaInitialized
    };
  }

  // 카테고리별 Q&A 조회
  getQAByCategory(category: string): QAItem[] {
    return this.knowledgeBase.filter(item => item.category === category);
  }

  // Q&A 검색 (외부 인터페이스)
  searchKnowledge(query: string, limit: number = 10): QASearchResult[] {
    return this.searchQA(query, limit);
  }

  // Q&A 파일 업로드
  async uploadQAFile(fileContent: string): Promise<void> {
    await this.loadQAFile(fileContent);
  }

  // === 기존 메서드들 (활동 데이터 기반 응답) ===
  
  private async keywordMatchWithActivity(input: string, context: UserActivityContext): Promise<MacroResponse | null> {
    const inputLower = input.toLowerCase();
    
    for (const macro of this.macroResponses) {
      const keywordScore = macro.keywords.filter(keyword => 
        inputLower.includes(keyword.toLowerCase())
      ).length;
      
      if (keywordScore > 0) {
        if (macro.contextualConditions && !macro.contextualConditions(context)) {
          continue;
        }
        
        return { ...macro, confidence: keywordScore / macro.keywords.length };
      }
    }
    return null;
  }

  private generateContextualResponse(macro: MacroResponse, context: UserActivityContext): string {
    switch (macro.id) {
      case 'stats_overall':
        return this.generateStatsResponse(context);
      
      case 'streak_info':
        return this.generateStreakResponse(context);
      
      case 'quest_completion_rate':
        return this.generateQuestStatsResponse(context);
      
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

  // === 유틸리티 메서드들 ===
  
  private async enrichContextWithActivity(context: UserActivityContext): Promise<UserActivityContext> {
    try {
      const activityStats = this.activityService.getActivityStats();
      const recentActivities = this.activityService.activities().slice(0, 5);

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
      return {
        ...context,
        activityStats: this.activityService?.getActivityStats() || undefined,
        recentActivities: this.activityService?.activities()?.slice(0, 5) || []
      };
    }
  }

  private getPersonalizedGreeting(context: UserActivityContext): string {
    const userName = context.userName || '사용자';
    const streak = context.activityStats?.streakCount || 0;
    const hasGroups = context.hasJoinedGroups;
    const qaCount = this.knowledgeBase.length;
    
    const timeOfDay = this.getTimeOfDay();
    const greeting = `${timeOfDay} ${userName}님! 😊`;

    if (qaCount > 0) {
      return `${greeting}\n\n🤖 ${qaCount}개의 Q&A 데이터로 더욱 똑똑해진 AI 어시스턴트입니다!\n${streak >= 7 ? `🔥 ${streak}일 연속 활동 중! 오늘도 멋진 하루 보내세요!` : '무엇을 도와드릴까요?'}`;
    }

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

  // === 기존 호환성 메서드들 ===
  
  generateResponse(input: string): string {
    if (!input.trim()) {
      return '안녕하세요! 무엇을 도와드릴까요? 😊';
    }

    // Q&A 검색 우선
    const qaResults = this.searchQA(input, 1);
    if (qaResults.length > 0 && qaResults[0].score > 0.6) {
      return qaResults[0].item.answer;
    }

    // 기존 매크로 응답
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

  private fuzzyMatch(text: string, pattern: string): boolean {
    const threshold = 0.7;
    const similarity = this.calculateSimilarity(text, pattern);
    return similarity >= threshold;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(/\s+/));
    const set2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return '좋은 아침이에요!';
    if (hour < 18) return '안녕하세요!';
    return '좋은 저녁이에요!';
  }

  private getDefaultResponse(): string {
    const defaultResponses = [
      '죄송해요, 잘 이해하지 못했어요. 다시 말씀해 주시겠어요?',
      '좀 더 구체적으로 말씀해 주세요. "그룹 가입"이나 "퀘스트" 같은 키워드로 물어보세요!',
      '아직 그 질문에 대한 답변을 준비하지 못했어요. 다른 것을 물어보시겠어요?'
    ];
    
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  addMacroResponse(macro: MacroResponse): void {
    this.macroResponses.push(macro);
  }

  logInteraction(input: string, response: string, userFeedback?: 'helpful' | 'unhelpful'): void {
  }
}