// ChatbotService.ts - 동적 응답 기능이 통합된 챗봇 서비스
import { Injectable } from '@angular/core';
import { QAKnowledgeService, QASearchResult } from './QAKnowledgeService';
import { DynamicResponseService, DynamicResponse } from './DynamicResponseService';

export interface ChatbotMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  animated?: boolean;
}

export interface UserActivityContext {
  hasJoinedGroups: boolean;
  activeTab: string;
  selectedGroup: string | null;
  selectedChannel: string | null;
  userName?: string;
  initialized: boolean;
  recentActivities?: any[];
}

export interface LearningData {
  userQuery: string;
  botResponse: string;
  feedback: 'helpful' | 'unhelpful';
  timestamp: Date;
  context?: UserActivityContext;
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  private learningData: LearningData[] = [];
  private responseCache = new Map<string, { response: string; timestamp: number }>();
  private readonly CACHE_DURATION = 2 * 60 * 1000; // 2분 (동적 데이터는 짧게 캐시)

  constructor(
    private qaService: QAKnowledgeService,
    private dynamicService: DynamicResponseService
  ) {
    this.loadLearningData();
  }

  // === 메인 응답 생성 메서드 (동적 응답 통합) ===
  async generateResponseWithActivity(query: string, userContext?: UserActivityContext): Promise<string> {
    try {
      // 1. 캐시 확인 (동적 데이터는 짧은 캐시)
      const cacheKey = this.generateCacheKey(query, userContext);
      const cachedResponse = this.getCachedResponse(cacheKey);
      
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. 동적 응답 생성 시도
      const dynamicResponse = await this.dynamicService.generateDynamicResponse(query, userContext);
      
      let finalResponse: string;
      
      if (dynamicResponse.isSuccess && dynamicResponse.confidence > 0.7) {
        // 동적 응답이 성공적이고 신뢰도가 높은 경우
        finalResponse = dynamicResponse.content;
      } else {
        // 정적 Q&A 기반 응답으로 폴백
        const staticResponse = await this.generateStaticResponse(query, userContext);
        
        if (dynamicResponse.confidence > 0.3) {
          // 동적 응답도 어느 정도 유용한 경우 결합
          finalResponse = `${dynamicResponse.content}\n\n${staticResponse}`;
        } else {
          finalResponse = staticResponse;
        }
      }

      // 3. 응답 캐시 저장 (동적 데이터는 짧게)
      const cacheTime = dynamicResponse.dataSource === 'realtime' ? this.CACHE_DURATION : this.CACHE_DURATION * 5;
      this.setCachedResponse(cacheKey, finalResponse, cacheTime);

      return finalResponse;

    } catch (error) {
      console.error('Error in generateResponseWithActivity:', error);
      return this.generateFallbackResponse(query);
    }
  }

  // === 정적 Q&A 기반 응답 생성 ===
  private async generateStaticResponse(query: string, userContext?: UserActivityContext): Promise<string> {
    const qaResults = this.qaService.searchQA(query, 3);
    
    if (qaResults.length === 0) {
      return this.generateContextualFallback(query, userContext);
    }

    const bestMatch = qaResults[0];
    
    // 높은 신뢰도의 매치인 경우
    if (bestMatch.score > 0.8) {
      let response = bestMatch.item.answer;
      
      // 컨텍스트 기반 개인화
      response = this.personalizeResponse(response, userContext);
      
      // 관련 질문이 있으면 추가
      if (qaResults.length > 1) {
        response += '\n\n💡 관련 질문들:\n';
        response += qaResults.slice(1, 3).map((result, index) => 
          `${index + 1}. ${result.item.question}`
        ).join('\n');
      }
      
      return response;
    }
    
    // 중간 신뢰도의 경우 여러 답변 조합
    if (bestMatch.score > 0.5) {
      let response = `다음 정보가 도움이 될 것 같아요:\n\n${bestMatch.item.answer}`;
      
      if (qaResults.length > 1) {
        response += '\n\n📚 추가 참고사항:\n';
        response += qaResults.slice(1, 2).map(result => 
          `• ${result.item.answer.substring(0, 80)}${result.item.answer.length > 80 ? '...' : ''}`
        ).join('\n');
      }
      
      return this.personalizeResponse(response, userContext);
    }
    
    // 낮은 신뢰도의 경우
    return this.generateContextualFallback(query, userContext);
  }

  // === 컨텍스트 기반 개인화 ===
  private personalizeResponse(response: string, userContext?: UserActivityContext): string {
    if (!userContext) return response;
    
    let personalizedResponse = response;
    
    // 사용자 이름이 있으면 추가
    if (userContext.userName) {
      personalizedResponse = `${userContext.userName}님, ` + personalizedResponse;
    }
    
    // 현재 상황에 맞는 조언 추가
    if (!userContext.hasJoinedGroups && !response.includes('그룹')) {
      personalizedResponse += '\n\n💡 아직 그룹에 참여하지 않으셨다면, 그룹에 가입해서 더 많은 기능을 이용해보세요!';
    }
    
    if (userContext.selectedGroup && !response.includes(userContext.selectedGroup)) {
      personalizedResponse += `\n\n📍 현재 ${userContext.selectedGroup} 그룹에서 활동 중이시네요!`;
    }
    
    return personalizedResponse;
  }

  // === 컨텍스트 기반 폴백 응답 ===
  private generateContextualFallback(query: string, userContext?: UserActivityContext): string {
    const fallbacks = [];
    
    // 기본 사과 메시지
    fallbacks.push(`죄송해요, "${query}"에 대한 구체적인 답변을 찾지 못했습니다. 🤔`);
    
    // 컨텍스트 기반 제안
    if (userContext) {
      if (!userContext.hasJoinedGroups) {
        fallbacks.push('그룹에 참여해서 시작해보시는 건 어떨까요? 🎯');
      } else if (userContext.activeTab === 'group') {
        fallbacks.push('현재 그룹 페이지에 계시네요. 퀘스트나 채널 관련 질문이 있으시면 구체적으로 말씀해주세요! 💪');
      } else if (userContext.activeTab === 'activity') {
        fallbacks.push('활동 통계나 진행 현황에 대해 궁금하신가요? "통계 보여줘" 같이 말씀해주세요! 📊');
      }
    }
    
    // 일반적인 도움말 제안
    fallbacks.push('\n다음 중 하나를 시도해보세요:\n• "도움말" - 기본 사용법\n• "오늘 퀘스트" - 오늘의 할일\n• "통계 보여줘" - 현재 진행상황\n• "그룹 정보" - 참여 그룹 현황');
    
    return fallbacks.join('\n\n');
  }

  // === 학습 및 피드백 처리 ===
  learnFromInteraction(userQuery: string, botResponse: string, feedback: 'helpful' | 'unhelpful', context?: UserActivityContext): void {
    const learningEntry: LearningData = {
      userQuery,
      botResponse,
      feedback,
      timestamp: new Date(),
      context
    };
    
    this.learningData.push(learningEntry);
    
    // 저장소에 학습 데이터 저장
    this.saveLearningData();
    
    // 부정적 피드백인 경우 즉시 개선 시도
    if (feedback === 'unhelpful') {
      this.analyzeNegativeFeedback(learningEntry);
    }
  }

  private analyzeNegativeFeedback(learningEntry: LearningData): void {
    // 부정적 피드백 패턴 분석 및 개선점 도출
    console.log('Analyzing negative feedback for improvement:', {
      query: learningEntry.userQuery,
      response: learningEntry.botResponse.substring(0, 100),
      context: learningEntry.context?.activeTab
    });
    
    // 향후 ML 모델 훈련이나 응답 개선에 활용할 수 있는 데이터
  }

  // === Q&A 관리 기능 ===
  async uploadQAFile(content: string): Promise<void> {
    try {
      await this.qaService.loadQAFile(content);
      // 캐시 초기화 (새로운 Q&A 데이터로 응답이 달라질 수 있음)
      this.responseCache.clear();
    } catch (error) {
      console.error('Failed to upload Q&A file:', error);
      throw error;
    }
  }

  searchKnowledge(query: string): QASearchResult[] {
    return this.qaService.searchQA(query, 5);
  }

  getQAStats() {
    const baseStats = this.qaService.getStats();
    const learningStats = this.getLearningStats();
    
    return {
      ...baseStats,
      learning: learningStats
    };
  }

  private getLearningStats() {
    const totalFeedback = this.learningData.length;
    const helpfulCount = this.learningData.filter(entry => entry.feedback === 'helpful').length;
    const unhelpfulCount = totalFeedback - helpfulCount;
    
    return {
      totalInteractions: totalFeedback,
      helpfulPercentage: totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0,
      unhelpfulCount,
      lastInteraction: this.learningData.length > 0 ? this.learningData[this.learningData.length - 1].timestamp : null
    };
  }

  // === 캐시 관리 ===
  private generateCacheKey(query: string, userContext?: UserActivityContext): string {
    const contextHash = userContext ? this.hashContext(userContext) : 'no-context';
    return `${query.toLowerCase().trim()}-${contextHash}`;
  }

  private hashContext(context: UserActivityContext): string {
    // 동적 데이터에 영향을 주는 컨텍스트만 해시에 포함
    const relevantContext = {
      hasGroups: context.hasJoinedGroups,
      tab: context.activeTab,
      group: context.selectedGroup,
      channel: context.selectedChannel
    };
    
    return JSON.stringify(relevantContext);
  }

  private getCachedResponse(key: string): string | null {
    const entry = this.responseCache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
      this.responseCache.delete(key);
      return null;
    }

    return entry.response;
  }

  private setCachedResponse(key: string, response: string, duration: number = this.CACHE_DURATION): void {
    // 캐시 크기 제한
    if (this.responseCache.size >= 50) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) this.responseCache.delete(oldestKey);
    }

    this.responseCache.set(key, {
      response,
      timestamp: Date.now()
    });
  }

  // === 폴백 응답 ===
  private generateFallbackResponse(query: string): string {
    const fallbackResponses = [
      "죄송해요, 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요. 🔄",
      "현재 서비스에 접속하기 어려운 상황입니다. 조금 후에 다시 질문해주세요. ⏰",
      "시스템 처리 중 오류가 발생했습니다. 다시 한 번 말씀해주시겠어요? 🤖"
    ];
    
    const randomIndex = Math.floor(Math.random() * fallbackResponses.length);
    return fallbackResponses[randomIndex];
  }

  // === 저장소 관리 ===
  private loadLearningData(): void {
    try {
      const stored = localStorage.getItem('chatbot_learning_data');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.learningData = parsed.map((entry: any) => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }));
      }
    } catch (error) {
      console.error('Failed to load learning data:', error);
      this.learningData = [];
    }
  }

  private saveLearningData(): void {
    try {
      // 최근 100개 학습 데이터만 보관
      const dataToSave = this.learningData.slice(-100);
      localStorage.setItem('chatbot_learning_data', JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Failed to save learning data:', error);
    }
  }

  // === 디버깅 및 관리 메서드 ===
  clearCache(): void {
    this.responseCache.clear();
  }

  clearLearningData(): void {
    this.learningData = [];
    localStorage.removeItem('chatbot_learning_data');
  }

  getPerformanceMetrics() {
    return {
      cacheSize: this.responseCache.size,
      learningDataSize: this.learningData.length,
      qaStats: this.qaService.getStats(),
      lastCacheCleanup: new Date().toISOString()
    };
  }

  // === 특수 기능들 ===
  
  // 사용자의 현재 상황에 맞는 제안 생성
  generateContextualSuggestions(userContext: UserActivityContext): string[] {
    const suggestions: string[] = [];
    
    if (!userContext.hasJoinedGroups) {
      suggestions.push('그룹 참여 방법');
      suggestions.push('시작하기 가이드');
    } else {
      suggestions.push('오늘 퀘스트 확인');
      suggestions.push('진행 상황 보기');
      suggestions.push('연속 기록 확인');
    }
    
    if (userContext.selectedGroup) {
      suggestions.push(`${userContext.selectedGroup} 그룹 정보`);
    }
    
    return suggestions;
  }

  // 시간대별 맞춤 인사말
  generateTimeBasedGreeting(): string {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
      return '좋은 아침이에요! ☀️ 오늘도 멋진 하루 시작해볼까요?';
    } else if (hour >= 12 && hour < 18) {
      return '안녕하세요! 🌤️ 오늘 하루는 어떻게 보내고 계신가요?';
    } else if (hour >= 18 && hour < 22) {
      return '좋은 저녁이에요! 🌅 오늘 하루 수고 많으셨어요!';
    } else {
      return '늦은 시간까지 고생이 많으세요! 🌙 무엇을 도와드릴까요?';
    }
  }

  // 긴급 상황 처리
  handleEmergencyQuery(query: string): string {
    const emergencyKeywords = ['오류', '버그', '안됨', '문제', '도움', '긴급'];
    const hasEmergencyKeyword = emergencyKeywords.some(keyword => query.includes(keyword));
    
    if (hasEmergencyKeyword) {
      return `🚨 문제가 발생하셨군요! 다음을 확인해보세요:\n\n1. 인터넷 연결 상태\n2. 페이지 새로고침 (F5)\n3. 브라우저 캐시 삭제\n\n그래도 해결되지 않으면 구체적인 상황을 알려주세요!`;
    }
    
    return '';
  }
}