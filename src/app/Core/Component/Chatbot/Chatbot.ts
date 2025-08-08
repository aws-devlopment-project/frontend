// 최적화된 Chatbot.ts - 피드백 모달 제거된 버전
import { Component, OnInit, OnDestroy, signal, computed, effect, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatBadgeModule } from '@angular/material/badge';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ChatbotService, ChatbotMessage, UserActivityContext } from '../../Service/ChatbotService';
import { SharedStateService } from '../../Service/SharedService';
import { LocalActivityService } from '../../../DashBoard/Service/LocalActivityService';

interface CacheEntry {
  response: string;
  timestamp: number;
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
    MatBadgeModule
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush // 성능 최적화
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
  
  // 즉석 응답 시스템
  private quickResponses = new Map<string, string | (() => string)>([
    ['안녕', '안녕하세요! 무엇을 도와드릴까요? 😊'],
    ['안녕하세요', '안녕하세요! 무엇을 도와드릴까요? 😊'],
    ['hi', 'Hi there! How can I help you? 😊'],
    ['hello', 'Hello! How can I assist you today? 😊'],
    ['도움말', () => this.getHelpMessage()],
    ['help', () => this.getHelpMessage()]
  ]);

  // === Signals ===
  isOpen = signal<boolean>(false);
  isTyping = signal<boolean>(false);
  isMinimized = signal<boolean>(false);
  private allMessages = signal<ChatbotMessage[]>([]);
  userInputValue = signal<string>('');
  notificationCount = signal<number>(0);
  
  // 성능 최적화: 표시할 메시지만 computed로 계산
  readonly messages = computed(() => {
    const messages = this.allMessages();
    return messages.slice(-this.MAX_MESSAGES); // 최근 메시지만 표시
  });
  
  // Computed signals
  readonly hasNotifications = computed(() => this.notificationCount() > 0);
  readonly isEmpty = computed(() => this.allMessages().length === 0);
  readonly canSend = computed(() => this.userInputValue().trim().length > 0 && !this.isTyping());

  // Quick action buttons
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
    this.preloadCommonResponses(); // 자주 사용되는 응답 미리 로드

    // SharedState 변화 모니터링 (디바운싱 적용)
    effect(() => {
      const user = this.sharedState.currentUser();
      const hasGroups = this.sharedState.hasJoinedGroups();
      console.log('Chatbot: SharedState changed', { user: user?.name, hasGroups });
    });
  }

  ngOnInit(): void {
    console.log('Chatbot initialized');
    this.loadStoredNotifications();
    this.cleanupCache(); // 캐시 정리
    this.schedulePerformanceCheck(); // 성능 체크 스케줄링
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.responseCache.clear(); // 메모리 정리
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // === TrackBy 함수 (성능 최적화) ===
  trackByMessageId(index: number, message: ChatbotMessage): string {
    return message.id;
  }

  // === 캐시 시스템 ===
  private generateCacheKey(input: string, context?: UserActivityContext): string {
    const contextHash = context ? this.hashContext(context) : '';
    return `${input.toLowerCase().trim()}-${contextHash}`;
  }

  private hashContext(context: UserActivityContext): string {
    // 컨텍스트의 중요한 부분만 해시화
    const relevantContext = {
      group: context.selectedGroup,
      channel: context.selectedChannel,
      hasGroups: context.hasJoinedGroups
    };
    return btoa(JSON.stringify(relevantContext)).slice(0, 8);
  }

  private getCachedResponse(key: string): string | null {
    const entry = this.responseCache.get(key);
    if (!entry) return null;

    // 캐시 만료 확인
    if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
      this.responseCache.delete(key);
      return null;
    }

    return entry.response;
  }

  private setCachedResponse(key: string, response: string): void {
    // 캐시 크기 제한
    if (this.responseCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey)
        this.responseCache.delete(oldestKey);
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

  // === 즉석 응답 시스템 ===
  private getQuickResponse(input: string): string | null {
    const normalizedInput = input.toLowerCase().trim();
    const response = this.quickResponses.get(normalizedInput);
    
    if (response) {
      return typeof response === 'function' ? response() : response;
    }

    // 부분 매칭 시도
    for (const [key, value] of this.quickResponses.entries()) {
      if (normalizedInput.includes(key) || key.includes(normalizedInput)) {
        return typeof value === 'function' ? value() : value;
      }
    }

    return null;
  }

  private getHelpMessage(): string {
    return `
🔧 사용 가능한 명령어:
• "통계 보여줘" - 활동 통계 확인
• "오늘 퀘스트는?" - 오늘의 퀘스트 목록
• "연속 기록은?" - 연속 달성 기록
• "도움말" - 이 메시지 보기

💡 팁: 자연스러운 대화로 질문해보세요!
    `;
  }

  // === 메시지 관리 최적화 ===
  
  private addWelcomeMessage(): void {
    const welcomeMessage: ChatbotMessage = {
      id: this.generateMessageId(),
      text: '안녕하세요! 무엇을 도와드릴까요? 😊',
      isUser: false,
      timestamp: new Date(),
      animated: false
    };
    
    this.allMessages.set([welcomeMessage]);
  }

  private addMessage(text: string, isUser: boolean, animated: boolean = true): ChatbotMessage {
    const newMessage: ChatbotMessage = {
      id: this.generateMessageId(),
      text,
      isUser,
      timestamp: new Date(),
      animated
    };

    // 메시지 수 제한 적용
    const currentMessages = this.allMessages();
    let updatedMessages = [...currentMessages, newMessage];
    
    if (updatedMessages.length > this.MAX_MESSAGES * 2) { // 버퍼 포함
      updatedMessages = updatedMessages.slice(-this.MAX_MESSAGES);
    }
    
    this.allMessages.set(updatedMessages);
    
    console.log('Message added:', { 
      text: text.substring(0, 50), 
      isUser, 
      totalMessages: this.allMessages().length 
    });
    
    this.shouldScrollToBottom = true;
    this.cdr.markForCheck(); // OnPush 전략용
    
    return newMessage;
  }

  // === 최적화된 메시지 전송 ===

  async sendMessage(messageText?: string): Promise<void> {
    const inputText = messageText || this.userInputValue().trim();
    
    if (!inputText || this.isTyping()) {
      return;
    }

    // 성능 측정 시작
    const startTime = performance.now();
    console.log('Sending message:', inputText);

    // 사용자 메시지 추가
    this.addMessage(inputText, true, false);
    this.userInputValue.set('');

    try {
      // 1. 즉석 응답 확인
      const quickResponse = this.getQuickResponse(inputText);
      if (quickResponse) {
        console.log(`Quick response found in ${(performance.now() - startTime).toFixed(2)}ms`);
        await this.simulateTypingDelay(300); // 자연스러운 지연
        this.addMessage(quickResponse, false, true);
        return;
      }

      // 2. 캐시된 응답 확인
      const userContext = this.createOptimizedUserContext();
      const cacheKey = this.generateCacheKey(inputText, userContext);
      const cachedResponse = this.getCachedResponse(cacheKey);
      
      if (cachedResponse) {
        console.log(`Cached response found in ${(performance.now() - startTime).toFixed(2)}ms`);
        await this.simulateTypingDelay(500);
        this.addMessage(cachedResponse, false, true);
        return;
      }

      // 3. 새로운 응답 생성
      this.isTyping.set(true);
      
      await this.simulateTypingDelay(800); // 타이핑 시뮬레이션
      
      const response = await this.chatbotService.generateResponseWithActivity(inputText, userContext);
      
      console.log(`New response generated in ${(performance.now() - startTime).toFixed(2)}ms`);
      
      // 응답 캐시 저장
      this.setCachedResponse(cacheKey, response);
      
      this.addMessage(response, false, true);
      
    } catch (error) {
      console.error('Error generating chatbot response:', error);
      this.addMessage('죄송해요, 일시적인 오류가 발생했습니다. 다시 시도해 주세요.', false, true);
    } finally {
      this.isTyping.set(false);
      console.log(`Total response time: ${(performance.now() - startTime).toFixed(2)}ms`);
    }
  }

  private async simulateTypingDelay(baseDelay: number): Promise<void> {
    const randomDelay = baseDelay + (Math.random() * 200 - 100); // ±100ms 랜덤
    await new Promise(resolve => setTimeout(resolve, Math.max(100, randomDelay)));
  }

  // === 최적화된 컨텍스트 생성 ===
  private createOptimizedUserContext(): UserActivityContext {
    const currentUser = this.sharedState.currentUser();
    
    // 최근 활동만 포함하여 컨텍스트 크기 최소화
    const recentActivities = this.activityService.activities()
      .filter(activity => this.isRecentActivity(activity.timestamp))
      .slice(-5); // 최근 5개만
    
    return {
      hasJoinedGroups: this.sharedState.hasJoinedGroups(),
      activeTab: this.sharedState.activeTab(),
      selectedGroup: this.sharedState.selectedGroup(),
      selectedChannel: this.sharedState.selectedChannel(),
      userName: currentUser?.name,
      initialized: this.sharedState.initialized(),
      recentActivities // 추가된 최적화된 활동 데이터
    };
  }

  // === 성능 모니터링 ===
  private schedulePerformanceCheck(): void {
    // 5분마다 성능 체크 및 최적화
    setInterval(() => {
      this.performPerformanceCheck();
    }, 5 * 60 * 1000);
  }

  private performPerformanceCheck(): void {
    // 메모리 사용량 체크
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
      console.log(`Memory usage: ${usedMB}MB`);
      
      // 메모리 사용량이 높으면 정리 수행
      if (usedMB > 50) {
        this.performCleanup();
      }
    }

    // 캐시 정리
    this.cleanupCache();
  }

  private performCleanup(): void {
    console.log('Performing cleanup...');
    
    // 오래된 메시지 정리
    const messages = this.allMessages();
    if (messages.length > this.MAX_MESSAGES) {
      const recentMessages = messages.slice(-this.MAX_MESSAGES);
      this.allMessages.set(recentMessages);
    }

    // 캐시 일부 정리
    if (this.responseCache.size > this.MAX_CACHE_SIZE / 2) {
      const entries = Array.from(this.responseCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // 오래된 캐시 절반 삭제
      const toDelete = entries.slice(0, Math.floor(entries.length / 2));
      toDelete.forEach(([key]) => this.responseCache.delete(key));
    }
  }

  // === 프리로딩 시스템 ===
  private async preloadCommonResponses(): Promise<void> {
    const commonQueries = ['통계 보여줘', '오늘 퀘스트는?', '연속 기록은?', '도움말'];
    
    // 백그라운드에서 미리 로드 (사용자 경험에 영향 주지 않음)
    setTimeout(async () => {
      const context = this.createOptimizedUserContext();
      
      for (const query of commonQueries) {
        try {
          const cacheKey = this.generateCacheKey(query, context);
          if (!this.getCachedResponse(cacheKey)) {
            const response = await this.chatbotService.generateResponseWithActivity(query, context);
            this.setCachedResponse(cacheKey, response);
          }
        } catch (error) {
          console.warn(`Failed to preload response for: ${query}`, error);
        }
        
        // 다음 쿼리 전에 잠시 대기 (서버 부하 방지)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('Common responses preloaded');
    }, 2000); // 2초 후 시작
  }

  // === 나머지 메서드들 (기존 유지) ===
  
  toggleChatbot(): void {
    if (this.isMinimized()) {
      this.maximize();
    } else {
      this.isOpen.update(current => {
        const newState = !current;
        if (newState) {
          this.clearNotifications();
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

  onQuickAction(action: string): void {
    this.sendMessage(action);
  }

  // === 퀘스트 완료 알림 시스템 (간소화) ===

  private monitorQuestCompletions(): void {
    // LocalActivityService의 활동을 모니터링 (성능 최적화)
    effect(() => {
      const activities = this.activityService.activities();
      const questCompletions = activities.filter(activity => 
        activity.type === 'quest_complete' && 
        this.isRecentActivity(activity.timestamp)
      );

      if (questCompletions.length > 0) {
        // 배치 처리로 성능 최적화
        this.batchProcessQuestCompletions(questCompletions);
      }
    });
  }

  private async batchProcessQuestCompletions(completions: any[]): Promise<void> {
    console.log('Batch processing quest completions:', completions.length);
    
    const unprocessedCompletions = completions.filter(completion => 
      !this.hasProcessedCompletion(completion.id)
    );

    if (unprocessedCompletions.length === 0) return;

    // 병렬 처리 (최대 3개씩)
    const batchSize = 3;
    for (let i = 0; i < unprocessedCompletions.length; i += batchSize) {
      const batch = unprocessedCompletions.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(completion => this.processQuestCompletion(completion))
      );
      
      // 다음 배치 전에 잠시 대기 (성능 고려)
      if (i + batchSize < unprocessedCompletions.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 알림 개수 업데이트
    this.updateNotificationCount();
  }

  private isRecentActivity(timestamp: Date): boolean {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const timeDiff = now.getTime() - activityTime.getTime();
    return timeDiff < 5 * 60 * 1000; // 5분 이내
  }

  private async processQuestCompletion(completion: any): Promise<void> {
    const questName = completion.context?.questName || completion.title;
    
    try {
      // 축하 메시지만 추가 (피드백은 그룹 대시보드에서 처리)
      if (!this.isOpen()) {
        this.addCongratulationMessage(questName);
      }

      // 완료 처리 마킹
      this.markCompletionAsProcessed(completion.id);
      
    } catch (error) {
      console.error('Error processing quest completion:', error);
    }
  }

  private addCongratulationMessage(questName: string): void {
    const congratsMessage = `🎉 "${questName}" 퀘스트 완료를 축하드립니다!`;
    
    this.addMessage(congratsMessage, false, true);
  }

  // === 피드백 관련 메서드는 그룹 대시보드에서 처리하므로 제거 ===

  // === 알림 관리 (최적화) ===

  private hasProcessedCompletion(completionId: string): boolean {
    try {
      const processed = localStorage.getItem('processed_completions');
      if (!processed) return false;
      
      const processedIds = JSON.parse(processed);
      return processedIds.includes(completionId);
    } catch (error) {
      console.error('Error checking processed completions:', error);
      return false;
    }
  }

  private markCompletionAsProcessed(completionId: string): void {
    try {
      const processed = localStorage.getItem('processed_completions');
      const processedIds = processed ? JSON.parse(processed) : [];
      
      if (!processedIds.includes(completionId)) {
        processedIds.push(completionId);
        
        // 최대 100개까지만 저장 (메모리 절약)
        if (processedIds.length > 100) {
          processedIds.splice(0, processedIds.length - 100);
        }
        localStorage.setItem('processed_completions', JSON.stringify(processedIds));
      }
    } catch (error) {
      console.error('Error marking completion as processed:', error);
    }
  }

  private updateNotificationCount(): void {
    try {
      const activities = this.activityService.activities();
      const recentCompletions = activities.filter(activity => 
        activity.type === 'quest_complete' && 
        this.isRecentActivity(activity.timestamp) &&
        !this.hasProcessedCompletion(activity.id)
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
    try {
      // 현재 모든 완료를 처리된 것으로 마킹
      const activities = this.activityService.activities();
      const completions = activities.filter(activity => activity.type === 'quest_complete');
      
      completions.forEach(completion => {
        this.markCompletionAsProcessed(completion.id);
      });

      this.notificationCount.set(0);
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }

  // === 유틸리티 메서드 (최적화) ===

  private generateMessageId(): string {
    // 더 효율적인 ID 생성
    return `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  }

  private scrollToBottom(): void {
    if (this.chatMessagesElement?.nativeElement) {
      const element = this.chatMessagesElement.nativeElement;
      // 부드러운 스크롤링 대신 즉시 스크롤 (성능 최적화)
      element.scrollTop = element.scrollHeight;
    }
  }

  private focusInput(): void {
    if (this.userInputElement?.nativeElement) {
      // RAF를 사용해 다음 프레임에서 포커스 (레이아웃 완료 후)
      requestAnimationFrame(() => {
        this.userInputElement.nativeElement.focus();
      });
    }
  }

  // === 공개 메서드 (디버깅 및 관리용) ===

  // 성능 통계 조회
  getPerformanceStats(): any {
    return {
      cacheSize: this.responseCache.size,
      messageCount: this.allMessages().length,
      displayedMessageCount: this.messages().length,
      memoryUsage: 'memory' in performance ? 
        Math.round(((performance as any).memory?.usedJSHeapSize || 0) / 1048576) + 'MB' : 'N/A'
    };
  }

  // 캐시 수동 정리
  clearCache(): void {
    this.responseCache.clear();
    console.log('Response cache cleared');
  }

  // 전체 초기화 (개발용)
  resetChatbot(): void {
    this.allMessages.set([]);
    this.responseCache.clear();
    this.addWelcomeMessage();
    console.log('Chatbot reset complete');
  }
}