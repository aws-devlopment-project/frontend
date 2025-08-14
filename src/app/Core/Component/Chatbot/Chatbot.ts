// Chatbot.ts - 퀘스트 완료 메시지 자동 추가 개선
import { Component, OnInit, OnDestroy, signal, computed, effect, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';

import { ChatbotService, ChatbotMessage, UserActivityContext } from '../../Service/ChatbotService';
import { SharedStateService } from '../../Service/SharedService';
import { LocalActivityService } from '../../../DashBoard/Service/LocalActivityService';

interface CacheEntry {
  response: string;
  timestamp: number;
}

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
    MatTooltipModule
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
  
  // 퀘스트 완료 추적을 위한 새로운 프로퍼티들
  private lastProcessedActivityCount = 0;
  private processedQuestCompletions = new Set<string>();
  
  // 성능 최적화: 응답 캐시 및 디바운싱
  private responseCache = new Map<string, CacheEntry>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5분
  private readonly MAX_MESSAGES = 50;
  private readonly MAX_CACHE_SIZE = 100;
  
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
    return messages.slice(-this.MAX_MESSAGES);
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
    this.setupQuestCompletionMonitoring(); // 개선된 퀘스트 모니터링
    this.initializeQAStats();
  }

  ngOnInit(): void {
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

  // === 개선된 퀘스트 완료 모니터링 ===
  
  private setupQuestCompletionMonitoring(): void {
    // LocalActivityService의 activities를 모니터링
    effect(() => {
      const activities = this.activityService.activities();
      this.processNewQuestCompletions(activities);
    });

    // SharedStateService의 상태 변화도 모니터링 (추가적인 안전장치)
    effect(() => {
      const initialized = this.sharedState.initialized();
      const hasGroups = this.sharedState.hasJoinedGroups();
      
      if (initialized && hasGroups) {
        this.checkForRecentQuestCompletions();
      }
    });
  }

  private processNewQuestCompletions(activities: any[]): void {
    // 새로운 퀘스트 완료 활동만 처리
    const newActivities = activities.slice(0, activities.length - this.lastProcessedActivityCount);
    
    newActivities.forEach(activity => {
      if (activity.type === 'quest_complete' && !this.processedQuestCompletions.has(activity.id)) {
        this.addQuestCompletionMessage(activity);
        this.processedQuestCompletions.add(activity.id);
        this.incrementNotificationCount();
      }
    });

    this.lastProcessedActivityCount = activities.length;
  }

  private addQuestCompletionMessage(activity: any): void {
    const questName = activity.context?.questName || '퀘스트';
    const groupName = activity.context?.groupName || '그룹';
    
    const congratulationMessages = [
      `🎉 축하합니다! "${questName}" 퀘스트를 완료하셨습니다!`,
      `✨ 멋져요! "${questName}" 미션을 성공적으로 달성했습니다!`,
      `🎯 훌륭합니다! "${questName}" 퀘스트 완료! 한 걸음 더 성장하셨네요!`,
      `🏆 대단해요! "${questName}" 퀘스트를 완료하시며 목표에 한 발짝 더 가까워졌습니다!`
    ];

    const randomMessage = congratulationMessages[Math.floor(Math.random() * congratulationMessages.length)];
    
    let fullMessage = randomMessage;
    
    // 연속 완료 체크
    const streak = this.activityService.getCurrentStreak();
    if (streak >= 3) {
      fullMessage += `\n\n🔥 현재 ${streak}일 연속 활동 중이시네요! 놀라운 꾸준함입니다!`;
    }

    // 그룹 정보 추가
    if (groupName && groupName !== '그룹') {
      fullMessage += `\n\n📍 완료된 그룹: ${groupName}`;
    }

    // 격려 메시지 추가
    const encouragementMessages = [
      '계속해서 멋진 성과를 이어가세요! 💪',
      '다음 목표도 화이팅입니다! 🌟',
      '이런 꾸준함이 큰 변화를 만들어냅니다! ✨',
      '오늘도 한 걸음 성장하셨네요! 🚀'
    ];

    const randomEncouragement = encouragementMessages[Math.floor(Math.random() * encouragementMessages.length)];
    fullMessage += `\n\n${randomEncouragement}`;

    // 메시지 추가
    setTimeout(() => {
      this.addMessageWithFeedback(fullMessage, false, true);
    }, 500); // 약간의 지연으로 자연스럽게 표시
  }

  private checkForRecentQuestCompletions(): void {
    // 최근 5분 이내의 퀘스트 완료 활동 확인
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentCompletions = this.activityService.activities()
      .filter(activity => 
        activity.type === 'quest_complete' && 
        activity.timestamp >= fiveMinutesAgo &&
        !this.processedQuestCompletions.has(activity.id)
      );

    recentCompletions.forEach(activity => {
      this.addQuestCompletionMessage(activity);
      this.processedQuestCompletions.add(activity.id);
      this.incrementNotificationCount();
    });
  }

  private incrementNotificationCount(): void {
    // 채팅창이 열려있지 않을 때만 알림 카운트 증가
    if (!this.isOpen()) {
      this.notificationCount.update(count => count + 1);
    }
  }

  // === Q&A 통계 관리 ===
  private initializeQAStats(): void {
    setTimeout(() => {
      const stats = this.chatbotService.getQAStats();
      this.qaStats.set(stats);
    }, 1000);
  }

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

    // 사용자 메시지 추가
    this.addMessageWithFeedback(inputText, true, false);
    this.userInputValue.set('');

    try {
      // 캐시 확인
      const userContext = this.createOptimizedUserContext();
      const cacheKey = this.generateCacheKey(inputText, userContext);
      const cachedResponse = this.getCachedResponse(cacheKey);
      
      if (cachedResponse) {
        await this.simulateTypingDelay(500);
        this.addMessageWithFeedback(cachedResponse, false, true);
        return;
      }

      this.isTyping.set(true);
      await this.simulateTypingDelay(800);
      
      // 개선된 응답 생성 (Q&A 통합)
      const response = await this.chatbotService.generateResponseWithActivity(inputText, userContext);
      
      // 응답 캐시 저장
      this.setCachedResponse(cacheKey, response);
      
      this.addMessageWithFeedback(response, false, true);
      
    } catch (error) {
      console.error('Error generating enhanced chatbot response:', error);
      this.addMessage('죄송해요, 일시적인 오류가 발생했습니다. 다시 시도해 주세요.', false, true);
    } finally {
      this.isTyping.set(false);
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
      showFeedback: !isUser && text.length > 10,
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
  }

  private handleNegativeFeedback(message: EnhancedChatbotMessage): void {
    setTimeout(() => {
      const followUpMessage = `죄송합니다. 답변이 도움이 되지 않았나 보네요. 😟\n\n다른 방식으로 질문해주시거나, 더 구체적으로 말씀해 주시면 더 나은 답변을 드릴 수 있어요!\n\n💡 예: "그룹 가입 방법", "퀘스트 완료 안됨" 등`;
      
      this.addMessage(followUpMessage, false, true);
    }, 1000);
  }

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

  // === 빠른 액션 처리 ===
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
        showFeedback: false
      };
      
      this.allMessages.set([welcomeMessage]);
    }, 1000);
  }

  // === 기존 메서드들과의 호환성 ===
  private addMessage(text: string, isUser: boolean, animated: boolean = true): EnhancedChatbotMessage {
    return this.addMessageWithFeedback(text, isUser, animated);
  }

  // === 캐시 및 성능 관리 ===
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
      const jsonString = JSON.stringify(relevantContext);
      return this.simpleHash(jsonString);
    } catch (error) {
      console.warn('Context hashing failed, using fallback:', error);
      return 'default-context';
    }
  }

  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
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

  trackByMessageId(index: number, message: EnhancedChatbotMessage): string {
    return message.id;
  }

  // === 성능 및 관리 메서드들 ===
  getPerformanceStats(): any {
    const baseStats = {
      cacheSize: this.responseCache.size,
      messageCount: this.allMessages().length,
      displayedMessageCount: this.messages().length,
      processedQuestCompletions: this.processedQuestCompletions.size,
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
  }

  resetChatbot(): void {
    this.allMessages.set([]);
    this.responseCache.clear();
    this.processedQuestCompletions.clear();
    this.lastProcessedActivityCount = 0;
    this.addWelcomeMessage();
  }

  // === 기존 알림 관련 메서드들 ===
  private updateNotificationCount(): void {
    try {
      // 최근 퀘스트 완료 활동 확인
      const activities = this.activityService.activities();
      const recentCompletions = activities.filter(activity => 
        activity.type === 'quest_complete' && 
        this.isRecentActivity(activity.timestamp) &&
        !this.processedQuestCompletions.has(activity.id)
      ).length;

      if (!this.isOpen()) {
        this.notificationCount.set(recentCompletions);
      }
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
      if (usedMB > 50) {
        this.performCleanup();
      }
    }
    this.cleanupCache();
  }

  private performCleanup(): void {
    const messages = this.allMessages();
    if (messages.length > this.MAX_MESSAGES) {
      const recentMessages = messages.slice(-this.MAX_MESSAGES);
      this.allMessages.set(recentMessages);
    }

    // 오래된 퀘스트 완료 추적 정보 정리
    if (this.processedQuestCompletions.size > 100) {
      this.processedQuestCompletions.clear();
      this.lastProcessedActivityCount = this.activityService.activities().length;
    }
  }
}