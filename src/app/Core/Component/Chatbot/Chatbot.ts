// Chatbot.ts - 기존 파일에 최소한의 Q&A 기능 추가
import { Component, OnInit, OnDestroy, signal, computed, effect, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip'; // 추가
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ChatbotService, ChatbotMessage, UserActivityContext } from '../../Service/ChatbotService'; // 기존 경로 유지
import { SharedStateService } from '../../Service/SharedService';
import { LocalActivityService } from '../../../DashBoard/Service/LocalActivityService';

interface CacheEntry {
  response: string;
  timestamp: number;
}

// ChatbotMessage 인터페이스에 피드백 속성 추가
interface EnhancedChatbotMessage extends ChatbotMessage {
  feedback?: 'helpful' | 'unhelpful' | null;
  showFeedback?: boolean;
  feedbackProvided?: boolean;
}

@Component({
  selector: 'app-chatbot',
  templateUrl: './Chatbot.html',
  styleUrls: ['./Chatbot.css'],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatCardModule,
    MatBadgeModule,
    MatTooltipModule // 추가
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatbotComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatMessages', { static: false }) 
  private chatMessagesElement!: ElementRef;
  @ViewChild('userInputRef', { static: false })
  private userInputElement!: ElementRef;

  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = false;
  
  // 성능 최적화: 응답 캐시 및 디바운싱
  private responseCache = new Map<string, CacheEntry>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5분
  private readonly MAX_MESSAGES = 50; // 메시지 제한
  private readonly MAX_CACHE_SIZE = 100; // 캐시 크기 제한
  
  // === Signals ===
  isOpen = signal<boolean>(false);
  isTyping = signal<boolean>(false);
  isMinimized = signal<boolean>(false);
  private allMessages = signal<EnhancedChatbotMessage[]>([]);
  userInputValue = signal<string>('');
  notificationCount = signal<number>(0);
  
  // 새로 추가: Q&A 통계
  qaStats = signal<any>({});
  showQAStats = signal<boolean>(false);
  
  // 성능 최적화: 표시할 메시지만 computed로 계산
  readonly messages = computed(() => {
    const messages = this.allMessages();
    return messages.slice(-this.MAX_MESSAGES); // 최근 메시지만 표시
  });
  
  // Computed signals
  readonly hasNotifications = computed(() => this.notificationCount() > 0);
  readonly isEmpty = computed(() => this.allMessages().length === 0);
  readonly canSend = computed(() => this.userInputValue().trim().length > 0 && !this.isTyping());

  // Quick action buttons (Q&A 검색 추가)
  readonly quickActions = signal<string[]>([
    '통계 보여줘',
    '오늘 퀘스트는?',
    '연속 기록은?',
    '도움말'
  ]);

  constructor(
    private chatbotService: ChatbotService,
    private sharedState: SharedStateService,
    private activityService: LocalActivityService,
    private cdr: ChangeDetectorRef
  ) {
    this.addWelcomeMessage();
    this.monitorQuestCompletions();
    this.initializeQAStats();
  }

  ngOnInit(): void {
    console.log('Enhanced Chatbot initialized');
    this.loadStoredNotifications();
    this.cleanupCache();
    this.schedulePerformanceCheck();
    this.updateQuickActions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.responseCache.clear();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // === Q&A 통계 관리 ===
  private initializeQAStats(): void {
    // ChatbotService의 Q&A 통계 가져오기
    setTimeout(() => {
      const stats = this.chatbotService.getQAStats();
      this.qaStats.set(stats);
    }, 1000); // 서비스 초기화 대기
  }

  // 템플릿에서 사용할 헬퍼 메서드 추가
  getCategoryCount(): number {
    const categories = this.qaStats()?.categories || {};
    return Object.keys(categories).length;
  }

  toggleQAStats(): void {
    this.showQAStats.update(show => !show);
  }

  // === 개선된 메시지 전송 ===
  async sendMessage(messageText?: string): Promise<void> {
    const inputText = messageText || this.userInputValue().trim();
    
    if (!inputText || this.isTyping()) {
      return;
    }

    const startTime = performance.now();
    console.log('Sending message with Q&A support:', inputText);

    // 사용자 메시지 추가
    this.addMessageWithFeedback(inputText, true, false);
    this.userInputValue.set('');

    try {
      // 캐시 확인
      const userContext = this.createOptimizedUserContext();
      const cacheKey = this.generateCacheKey(inputText, userContext);
      const cachedResponse = this.getCachedResponse(cacheKey);
      
      if (cachedResponse) {
        console.log(`Cached response found in ${(performance.now() - startTime).toFixed(2)}ms`);
        await this.simulateTypingDelay(500);
        this.addMessageWithFeedback(cachedResponse, false, true);
        return;
      }

      this.isTyping.set(true);
      await this.simulateTypingDelay(800);
      
      // 개선된 응답 생성 (Q&A 통합)
      const response = await this.chatbotService.generateResponseWithActivity(inputText, userContext);
      
      console.log(`Enhanced response generated in ${(performance.now() - startTime).toFixed(2)}ms`);
      
      // 응답 캐시 저장
      this.setCachedResponse(cacheKey, response);
      
      this.addMessageWithFeedback(response, false, true);
      
    } catch (error) {
      console.error('Error generating enhanced chatbot response:', error);
      this.addMessage('죄송해요, 일시적인 오류가 발생했습니다. 다시 시도해 주세요.', false, true);
    } finally {
      this.isTyping.set(false);
      console.log(`Total response time: ${(performance.now() - startTime).toFixed(2)}ms`);
    }
  }

  // === 피드백 기능이 있는 메시지 추가 ===
  private addMessageWithFeedback(text: string, isUser: boolean, animated: boolean = true): EnhancedChatbotMessage {
    const newMessage: EnhancedChatbotMessage = {
      id: this.generateMessageId(),
      text,
      isUser,
      timestamp: new Date(),
      animated,
      feedback: null,
      showFeedback: !isUser && text.length > 10, // 봇 메시지 중 충분히 긴 응답에만 피드백 표시
      feedbackProvided: false
    };

    const currentMessages = this.allMessages();
    let updatedMessages = [...currentMessages, newMessage];
    
    if (updatedMessages.length > this.MAX_MESSAGES * 2) {
      updatedMessages = updatedMessages.slice(-this.MAX_MESSAGES);
    }
    
    this.allMessages.set(updatedMessages);
    this.shouldScrollToBottom = true;
    this.cdr.markForCheck();
    
    return newMessage;
  }

  // === 피드백 처리 ===
  onMessageFeedback(messageId: string, feedback: 'helpful' | 'unhelpful'): void {
    const messages = this.allMessages();
    const messageIndex = messages.findIndex(m => m.id === messageId);
    
    if (messageIndex === -1) return;

    const updatedMessages = [...messages];
    const message = { ...updatedMessages[messageIndex] };
    
    message.feedback = feedback;
    message.feedbackProvided = true;
    updatedMessages[messageIndex] = message;
    
    this.allMessages.set(updatedMessages);

    // 피드백이 부정적인 경우 개선 제안
    if (feedback === 'unhelpful') {
      this.handleNegativeFeedback(message);
    }

    // 학습 데이터 수집
    const userMessage = this.findPreviousUserMessage(messageIndex);
    if (userMessage) {
      this.chatbotService.learnFromInteraction(
        userMessage.text, 
        message.text, 
        feedback
      );
    }

    console.log('Feedback provided:', { messageId, feedback });
  }

  // 부정적 피드백 처리
  private handleNegativeFeedback(message: EnhancedChatbotMessage): void {
    setTimeout(() => {
      const followUpMessage = `죄송합니다. 답변이 도움이 되지 않았나 보네요. 😔\n\n다른 방식으로 질문해주시거나, 더 구체적으로 말씀해 주시면 더 나은 답변을 드릴 수 있어요!\n\n💡 예: "그룹 가입 방법", "퀘스트 완료 안됨" 등`;
      
      this.addMessage(followUpMessage, false, true);
    }, 1000);
  }

  // 이전 사용자 메시지 찾기
  private findPreviousUserMessage(currentIndex: number): EnhancedChatbotMessage | null {
    const messages = this.allMessages();
    
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (messages[i].isUser) {
        return messages[i];
      }
    }
    return null;
  }

  // === Q&A 검색 기능 ===
  searchQA(query: string): void {
    if (!query.trim()) return;
    
    const results = this.chatbotService.searchKnowledge(query);
    
    if (results.length > 0) {
      const resultText = `🔍 "${query}"에 대한 검색 결과:\n\n` +
        results.slice(0, 3).map((result, index) => 
          `${index + 1}. ${result.item.question}\n   ${result.item.answer.substring(0, 100)}${result.item.answer.length > 100 ? '...' : ''}\n`
        ).join('\n');
      
      this.addMessage(resultText, false, true);
    } else {
      this.addMessage(`"${query}"에 대한 검색 결과가 없습니다. 다른 키워드로 검색해보세요.`, false, true);
    }
  }

  // === Q&A 파일 업로드 ===
  async uploadQAFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file || !file.name.endsWith('.txt')) {
      this.addMessage('올바른 텍스트 파일(.txt)을 선택해주세요.', false, true);
      return;
    }

    try {
      const content = await file.text();
      await this.chatbotService.uploadQAFile(content);
      
      const stats = this.chatbotService.getQAStats();
      this.qaStats.set(stats);
      
      this.addMessage(
        `✅ Q&A 파일이 성공적으로 업로드되었습니다!\n\n` +
        `📊 통계:\n` +
        `• 총 Q&A: ${stats.totalItems}개\n` +
        `• 카테고리: ${Object.keys(stats.categories).length}개\n` +
        `• 키워드 인덱스: ${stats.keywordIndexSize}개`,
        false,
        true
      );

      this.updateQuickActions();
    } catch (error) {
      console.error('Failed to upload Q&A file:', error);
      this.addMessage('Q&A 파일 업로드 중 오류가 발생했습니다.', false, true);
    }
  }

  // === 빠른 액션 업데이트 ===
  updateQuickActions(): void {
    const qaStats = this.qaStats();
    const hasQA = qaStats.totalItems > 0;
    
    const baseActions = [
      '통계 보여줘',
      '오늘 퀘스트는?',
      '연속 기록은?',
      '도움말'
    ];
    
    if (hasQA) {
      baseActions.push('Q&A 검색');
    }
    
    this.quickActions.set(baseActions);
  }

  // === 빠른 액션 처리 (확장) ===
  onQuickAction(action: string): void {
    if (action === 'Q&A 검색') {
      this.addMessage('어떤 것을 검색하시겠어요? 키워드를 입력해주세요.', false, true);
      setTimeout(() => this.focusInput(), 300);
    } else {
      this.sendMessage(action);
    }
  }

  // === 환영 메시지 개선 ===
  private addWelcomeMessage(): void {
    setTimeout(() => {
      const qaStats = this.qaStats();
      const welcomeText = qaStats.totalItems > 0 
        ? `안녕하세요! 🤖\n\n${qaStats.totalItems}개의 Q&A 데이터로 더욱 똑똑해진 AI 어시스턴트입니다! 무엇을 도와드릴까요? 😊`
        : '안녕하세요! 무엇을 도와드릴까요? 😊';
      
      const welcomeMessage: EnhancedChatbotMessage = {
        id: this.generateMessageId(),
        text: welcomeText,
        isUser: false,
        timestamp: new Date(),
        animated: false,
        showFeedback: false // 환영 메시지에는 피드백 버튼 표시 안함
      };
      
      this.allMessages.set([welcomeMessage]);
    }, 1000);
  }

  // === 기존 메서드들과의 호환성 ===
  private addMessage(text: string, isUser: boolean, animated: boolean = true): EnhancedChatbotMessage {
    return this.addMessageWithFeedback(text, isUser, animated);
  }

  // === 캐시 및 성능 관리 (기존 코드 유지) ===
  private generateCacheKey(input: string, context?: UserActivityContext): string {
    const contextHash = context ? this.hashContext(context) : '';
    return `${input.toLowerCase().trim()}-${contextHash}`;
  }

  private hashContext(context: UserActivityContext): string {
    const relevantContext = {
      group: context.selectedGroup,
      channel: context.selectedChannel,
      hasGroups: context.hasJoinedGroups
    };
    
    try {
      // JSON.stringify 후 안전한 해시 생성
      const jsonString = JSON.stringify(relevantContext);
      // btoa 대신 간단한 해시 함수 사용
      return this.simpleHash(jsonString);
    } catch (error) {
      console.warn('Context hashing failed, using fallback:', error);
      // 실패 시 간단한 문자열 반환
      return 'default-context';
    }
  }

  // 안전한 해시 함수 (btoa 대체)
  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit 정수로 변환
    }
    
    // 음수를 양수로 변환하고 16진수로 표현 (8자리로 제한)
    return Math.abs(hash).toString(16).slice(0, 8);
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

  private setCachedResponse(key: string, response: string): void {
    if (this.responseCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) this.responseCache.delete(oldestKey);
    }

    this.responseCache.set(key, {
      response,
      timestamp: Date.now()
    });
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.responseCache.entries()) {
      if (now - entry.timestamp > this.CACHE_DURATION) {
        this.responseCache.delete(key);
      }
    }
  }

  private createOptimizedUserContext(): UserActivityContext {
    const currentUser = this.sharedState.currentUser();
    const recentActivities = this.activityService.activities()
      .filter(activity => this.isRecentActivity(activity.timestamp))
      .slice(-5);
    
    return {
      hasJoinedGroups: this.sharedState.hasJoinedGroups(),
      activeTab: this.sharedState.activeTab(),
      selectedGroup: this.sharedState.selectedGroup(),
      selectedChannel: this.sharedState.selectedChannel(),
      userName: currentUser?.name,
      initialized: this.sharedState.initialized(),
      recentActivities
    };
  }

  private isRecentActivity(timestamp: Date): boolean {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const timeDiff = now.getTime() - activityTime.getTime();
    return timeDiff < 5 * 60 * 1000;
  }

  private async simulateTypingDelay(baseDelay: number): Promise<void> {
    const randomDelay = baseDelay + (Math.random() * 200 - 100);
    await new Promise(resolve => setTimeout(resolve, Math.max(100, randomDelay)));
  }

  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  }

  private scrollToBottom(): void {
    if (this.chatMessagesElement?.nativeElement) {
      const element = this.chatMessagesElement.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  private focusInput(): void {
    if (this.userInputElement?.nativeElement) {
      requestAnimationFrame(() => {
        this.userInputElement.nativeElement.focus();
      });
    }
  }

  // === 기존 메서드들 유지 ===
  toggleChatbot(): void {
    if (this.isMinimized()) {
      this.maximize();
    } else {
      this.isOpen.update(current => {
        const newState = !current;
        if (newState) {
          this.clearNotifications();
          this.updateQuickActions();
          setTimeout(() => {
            this.focusInput();
          }, 300);
        }
        return newState;
      });
    }
  }

  minimize(): void {
    this.isMinimized.set(true);
    this.isOpen.set(false);
  }

  maximize(): void {
    this.isMinimized.set(false);
    this.isOpen.set(true);
    this.clearNotifications();
    this.updateQuickActions();
    setTimeout(() => {
      this.focusInput();
    }, 300);
  }

  closeChatbot(): void {
    this.isOpen.set(false);
    this.isMinimized.set(false);
  }

  onInputKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // TrackBy 함수
  trackByMessageId(index: number, message: EnhancedChatbotMessage): string {
    return message.id;
  }

  // === 성능 및 관리 메서드들 ===
  getPerformanceStats(): any {
    const baseStats = {
      cacheSize: this.responseCache.size,
      messageCount: this.allMessages().length,
      displayedMessageCount: this.messages().length,
      memoryUsage: 'memory' in performance ? 
        Math.round(((performance as any).memory?.usedJSHeapSize || 0) / 1048576) + 'MB' : 'N/A'
    };

    const qaStats = this.qaStats();
    return {
      ...baseStats,
      qaKnowledgeBase: qaStats,
      responseQuality: this.calculateResponseQuality(),
      feedbackRate: this.calculateFeedbackRate()
    };
  }

  private calculateResponseQuality(): number {
    const messages = this.allMessages();
    const botMessages = messages.filter(m => !m.isUser && m.feedbackProvided);
    
    if (botMessages.length === 0) return 0;
    
    const positiveCount = botMessages.filter(m => m.feedback === 'helpful').length;
    return Math.round((positiveCount / botMessages.length) * 100);
  }

  private calculateFeedbackRate(): number {
    const messages = this.allMessages();
    const botMessages = messages.filter(m => !m.isUser && m.showFeedback);
    
    if (botMessages.length === 0) return 0;
    
    const feedbackCount = botMessages.filter(m => m.feedbackProvided).length;
    return Math.round((feedbackCount / botMessages.length) * 100);
  }

  clearCache(): void {
    this.responseCache.clear();
    console.log('Response cache cleared');
  }

  resetChatbot(): void {
    this.allMessages.set([]);
    this.responseCache.clear();
    this.addWelcomeMessage();
    console.log('Enhanced chatbot reset complete');
  }

  // === 기존 알림 관련 메서드들 (간소화) ===
  private monitorQuestCompletions(): void {
    // 기존 코드 유지 (간소화 버전)
    effect(() => {
      const activities = this.activityService.activities();
      const questCompletions = activities.filter(activity => 
        activity.type === 'quest_complete' && 
        this.isRecentActivity(activity.timestamp)
      );

      if (questCompletions.length > 0) {
        this.updateNotificationCount();
      }
    });
  }

  private updateNotificationCount(): void {
    try {
      const activities = this.activityService.activities();
      const recentCompletions = activities.filter(activity => 
        activity.type === 'quest_complete' && 
        this.isRecentActivity(activity.timestamp)
      ).length;

      this.notificationCount.set(recentCompletions);
    } catch (error) {
      console.error('Error updating notification count:', error);
    }
  }

  private loadStoredNotifications(): void {
    this.updateNotificationCount();
  }

  private clearNotifications(): void {
    this.notificationCount.set(0);
  }

  private schedulePerformanceCheck(): void {
    setInterval(() => {
      this.performPerformanceCheck();
    }, 5 * 60 * 1000);
  }

  private performPerformanceCheck(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
      console.log(`Memory usage: ${usedMB}MB`);
      
      if (usedMB > 50) {
        this.performCleanup();
      }
    }
    this.cleanupCache();
  }

  private performCleanup(): void {
    console.log('Performing cleanup...');
    const messages = this.allMessages();
    if (messages.length > this.MAX_MESSAGES) {
      const recentMessages = messages.slice(-this.MAX_MESSAGES);
      this.allMessages.set(recentMessages);
    }
  }
}