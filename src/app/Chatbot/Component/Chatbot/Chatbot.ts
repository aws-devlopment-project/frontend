// Chatbot.ts 업데이트 - 동적 응답 기능 통합
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
import { SharedStateService } from '../../../Core/Service/SharedService';
import { LocalActivityService } from '../../../DashBoard/Service/LocalActivityService';

interface EnhancedChatbotMessage extends ChatbotMessage {
  feedback?: 'helpful' | 'unhelpful' | null;
  showFeedback?: boolean;
  feedbackProvided?: boolean;
  responseType?: 'static' | 'dynamic' | 'hybrid';
  dataSource?: 'realtime' | 'cached' | 'static';
  confidence?: number;
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
  
  // 동적 응답 관련 상태
  private lastUserContext: UserActivityContext | null = null;
  private contextUpdateTimer: any;
  
  // 퀘스트 완료 추적을 위한 새로운 프로퍼티들
  private lastProcessedActivityCount = 0;
  private processedQuestCompletions = new Set<string>();
  
  // 성능 최적화: 응답 캐시 및 디바운싱
  private responseCache = new Map<string, { response: string; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5분
  private readonly MAX_MESSAGES = 50;
  
  // === Signals ===
  isOpen = signal<boolean>(false);
  isTyping = signal<boolean>(false);
  isMinimized = signal<boolean>(false);
  private allMessages = signal<EnhancedChatbotMessage[]>([]);
  userInputValue = signal<string>('');
  notificationCount = signal<number>(0);
  
  // 새로 추가: Q&A 통계 및 동적 응답 상태
  qaStats = signal<any>({});
  showQAStats = signal<boolean>(false);
  lastResponseType = signal<'static' | 'dynamic' | 'hybrid'>('static');
  responseConfidence = signal<number>(0);
  
  // 성능 최적화: 표시할 메시지만 computed로 계산
  readonly messages = computed(() => {
    const messages = this.allMessages();
    return messages.slice(-this.MAX_MESSAGES);
  });
  
  // Computed signals
  readonly hasNotifications = computed(() => this.notificationCount() > 0);
  readonly isEmpty = computed(() => this.allMessages().length === 0);
  readonly canSend = computed(() => this.userInputValue().trim().length > 0 && !this.isTyping());

  // 동적 Quick action buttons - 사용자 상황에 따라 변경
  readonly quickActions = computed(() => {
    const userContext = this.createUserContext();
    return this.chatbotService.generateContextualSuggestions(userContext);
  });

  constructor(
    private chatbotService: ChatbotService,
    private sharedState: SharedStateService,
    private activityService: LocalActivityService,
    private cdr: ChangeDetectorRef
  ) {
    this.addWelcomeMessage();
    this.setupQuestCompletionMonitoring();
    this.initializeQAStats();
    this.setupContextMonitoring(); // 새로 추가: 컨텍스트 모니터링
  }

  ngOnInit(): void {
    this.loadStoredNotifications();
    this.schedulePerformanceCheck();
    this.startContextUpdateTimer();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.responseCache.clear();
    if (this.contextUpdateTimer) {
      clearInterval(this.contextUpdateTimer);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // === 새로 추가: 컨텍스트 모니터링 설정 ===
  
  private setupContextMonitoring(): void {
    // SharedState 변화 감지
    effect(() => {
      const activeTab = this.sharedState.activeTab();
      const selectedGroup = this.sharedState.selectedGroup();
      const selectedChannel = this.sharedState.selectedChannel();
      const hasJoinedGroups = this.sharedState.hasJoinedGroups();
      
      // 중요한 상태 변화가 있으면 컨텍스트 업데이트
      const newContext = this.createUserContext();
      if (this.hasContextChanged(newContext)) {
        this.lastUserContext = newContext;
        this.updateQuickActionsForContext(newContext);
      }
    });
  }

  private hasContextChanged(newContext: UserActivityContext): boolean {
    if (!this.lastUserContext) return true;
    
    return (
      this.lastUserContext.activeTab !== newContext.activeTab ||
      this.lastUserContext.selectedGroup !== newContext.selectedGroup ||
      this.lastUserContext.selectedChannel !== newContext.selectedChannel ||
      this.lastUserContext.hasJoinedGroups !== newContext.hasJoinedGroups
    );
  }

  private updateQuickActionsForContext(context: UserActivityContext): void {
    // 컨텍스트 기반으로 Quick Actions 동적 업데이트
    const suggestions = this.chatbotService.generateContextualSuggestions(context);
    
    // 상황별 특별 메시지 추가
    if (context.activeTab === 'group' && !context.selectedGroup) {
      this.addContextualHint('👋 그룹을 선택하시면 해당 그룹의 퀘스트와 진행상황을 확인해드릴 수 있어요!');
    }
  }

  private addContextualHint(message: string): void {
    if (this.isOpen() && this.allMessages().length > 0) {
      setTimeout(() => {
        this.addMessageWithFeedback(message, false, true, 'dynamic');
      }, 1000);
    }
  }

  private startContextUpdateTimer(): void {
    // 5초마다 컨텍스트 업데이트 확인
    this.contextUpdateTimer = setInterval(() => {
      const newContext = this.createUserContext();
      if (this.hasContextChanged(newContext)) {
        this.lastUserContext = newContext;
      }
    }, 5000);
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
      fullMessage += `\n\n📁 완료된 그룹: ${groupName}`;
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
      this.addMessageWithFeedback(fullMessage, false, true, 'dynamic');
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

  // === 개선된 메시지 전송 (동적 응답 통합) ===
  async sendMessage(messageText?: string): Promise<void> {
    const inputText = messageText || this.userInputValue().trim();
    
    if (!inputText || this.isTyping()) {
      return;
    }

    const startTime = performance.now();

    // 사용자 메시지 추가
    this.addMessageWithFeedback(inputText, true, false, 'static');
    this.userInputValue.set('');

    try {
      this.isTyping.set(true);
      
      // 현재 사용자 컨텍스트 생성
      const userContext = this.createUserContext();
      
      // 타이핑 시뮬레이션 (동적 응답은 좀 더 오래 걸릴 수 있음)
      const isLikelyDynamicQuery = this.isDynamicQuery(inputText);
      const typingDelay = isLikelyDynamicQuery ? 1200 : 800;
      
      await this.simulateTypingDelay(typingDelay);
      
      // 개선된 응답 생성 (Q&A + 동적 데이터 통합)
      const response = await this.chatbotService.generateResponseWithActivity(inputText, userContext);
      
      // 응답 타입 및 신뢰도 추적
      this.trackResponseMetrics(inputText, response, userContext);
      
      this.addMessageWithFeedback(response, false, true, 'hybrid');
      
      // 성능 측정
      const processingTime = performance.now() - startTime;
      if (processingTime > 3000) {
        console.warn('Slow response detected:', processingTime + 'ms');
      }
      
    } catch (error) {
      console.error('Error generating enhanced chatbot response:', error);
      this.addMessageWithFeedback(
        '죄송해요, 일시적인 오류가 발생했습니다. 다시 시도해 주세요.', 
        false, 
        true, 
        'static'
      );
    } finally {
      this.isTyping.set(false);
    }
  }

  // === 동적 쿼리 감지 ===
  private isDynamicQuery(query: string): boolean {
    const dynamicKeywords = [
      '오늘', '현재', '진행', '통계', '연속', '그룹', '퀘스트', '활동', '최근'
    ];
    
    return dynamicKeywords.some(keyword => query.includes(keyword));
  }

  // === 응답 메트릭 추적 ===
  private trackResponseMetrics(query: string, response: string, context: UserActivityContext): void {
    // 응답 타입 감지
    let responseType: 'static' | 'dynamic' | 'hybrid' = 'static';
    
    if (response.includes('📅') || response.includes('📊') || response.includes('🔥')) {
      responseType = response.includes('💡') ? 'hybrid' : 'dynamic';
    }
    
    this.lastResponseType.set(responseType);
    
    // 신뢰도 추정 (응답 길이, 구체적 데이터 포함 여부 등 기반)
    let confidence = 0.5;
    
    if (responseType === 'dynamic') {
      // 숫자가 포함된 구체적 응답
      if (/\d+/.test(response)) confidence += 0.3;
      // 현재 상태 반영
      if (context.selectedGroup && response.includes(context.selectedGroup)) confidence += 0.2;
    }
    
    if (response.length > 100) confidence += 0.1;
    if (response.includes('죄송')) confidence -= 0.2;
    
    this.responseConfidence.set(Math.min(Math.max(confidence, 0), 1));
  }

  // === 향상된 메시지 추가 메서드 ===
  private addMessageWithFeedback(
    text: string, 
    isUser: boolean, 
    animated: boolean = true,
    responseType: 'static' | 'dynamic' | 'hybrid' = 'static'
  ): EnhancedChatbotMessage {
    const newMessage: EnhancedChatbotMessage = {
      id: this.generateMessageId(),
      text,
      isUser,
      timestamp: new Date(),
      animated,
      feedback: null,
      showFeedback: !isUser && text.length > 10,
      feedbackProvided: false,
      responseType,
      dataSource: responseType === 'dynamic' ? 'realtime' : 'static',
      confidence: this.responseConfidence()
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

  // === 사용자 컨텍스트 생성 ===
  private createUserContext(): UserActivityContext {
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
    return timeDiff < 5 * 60 * 1000; // 5분 이내
  }

  // === Q&A 통계 관리 개선 ===
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
    
    if (this.showQAStats()) {
      // 통계 패널이 열릴 때 최신 데이터 업데이트
      const updatedStats = this.chatbotService.getQAStats();
      this.qaStats.set(updatedStats);
    }
  }

  getPerformanceStats(): any {
    const baseStats = this.chatbotService.getPerformanceMetrics();
    const responsiveStats = {
      lastResponseType: this.lastResponseType(),
      responseConfidence: this.responseConfidence(),
      contextUpdates: this.lastUserContext ? 1 : 0
    };
    
    return {
      ...baseStats,
      responsive: responsiveStats
    };
  }

  // === 빠른 액션 처리 개선 ===
  onQuickAction(action: string): void {
    // 특별한 액션들 처리
    if (action === 'Q&A 검색') {
      this.addMessageWithFeedback('어떤 것을 검색하시겠어요? 키워드를 입력해주세요.', false, true, 'static');
      setTimeout(() => this.focusInput(), 300);
      return;
    }
    
    if (action === '도움말') {
      const helpMessage = this.chatbotService.generateTimeBasedGreeting() + '\n\n' + 
        '다음과 같은 도움을 받을 수 있어요:\n\n' +
        '📊 "통계 보여줘" - 현재 진행상황\n' +
        '🎯 "오늘 퀘스트" - 오늘의 할일\n' +
        '🔥 "연속 기록" - 활동 스트릭\n' +
        '👥 "그룹 정보" - 참여 그룹 현황\n' +
        '📱 "최근 활동" - 최근 활동 내역';
      
      this.addMessageWithFeedback(helpMessage, false, true, 'static');
      return;
    }

    // 일반적인 액션은 메시지로 전송
    this.sendMessage(action);
  }

  // === Q&A 파일 업로드 개선 ===
  async uploadQAFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file || !file.name.endsWith('.txt')) {
      this.addMessageWithFeedback('올바른 텍스트 파일(.txt)을 선택해주세요.', false, true, 'static');
      return;
    }

    try {
      const content = await file.text();
      await this.chatbotService.uploadQAFile(content);
      
      const stats = this.chatbotService.getQAStats();
      this.qaStats.set(stats);
      
      this.addMessageWithFeedback(
        `✅ Q&A 파일이 성공적으로 업로드되었습니다!\n\n` +
        `📊 통계:\n` +
        `• 총 Q&A: ${stats.totalItems}개\n` +
        `• 카테고리: ${Object.keys(stats.categories).length}개\n` +
        `• 키워드 인덱스: ${stats.keywordIndexSize}개\n\n` +
        `이제 더 정확한 답변을 드릴 수 있어요! 🎉`,
        false,
        true,
        'static'
      );

      // Quick Actions 업데이트
      this.updateQuickActionsForContext(this.createUserContext());
    } catch (error) {
      console.error('Failed to upload Q&A file:', error);
      this.addMessageWithFeedback('Q&A 파일 업로드 중 오류가 발생했습니다.', false, true, 'static');
    }
  }

  // === 환영 메시지 개선 ===
  private addWelcomeMessage(): void {
    setTimeout(() => {
      const userContext = this.createUserContext();
      const greeting = this.chatbotService.generateTimeBasedGreeting();
      
      let welcomeText = `${greeting}\n\n`;
      
      // 사용자 상황에 맞는 환영 메시지
      if (!userContext.hasJoinedGroups) {
        welcomeText += `아직 그룹에 참여하지 않으셨군요! 그룹에 가입해서 다른 사람들과 함께 목표를 달성해보세요. 🎯\n\n`;
        welcomeText += `"그룹 참여 방법"이라고 물어보시면 자세히 알려드릴게요!`;
      } else if (userContext.selectedGroup) {
        welcomeText += `현재 ${userContext.selectedGroup} 그룹에서 활동 중이시네요! 👥\n\n`;
        welcomeText += `"오늘 퀘스트" 또는 "진행 상황"을 물어보시면 현재 상태를 확인해드릴게요!`;
      } else {
        welcomeText += `여러 그룹에 참여하고 계시는군요! 멋져요! 🌟\n\n`;
        welcomeText += `"통계 보여줘"라고 하시면 전체 진행상황을 확인할 수 있어요!`;
      }
      
      const qaStats = this.qaStats();
      if (qaStats.totalItems > 0) {
        welcomeText += `\n\n💡 ${qaStats.totalItems}개의 Q&A 데이터로 더욱 똑똑해진 AI 어시스턴트입니다!`;
      }
      
      const welcomeMessage: EnhancedChatbotMessage = {
        id: this.generateMessageId(),
        text: welcomeText,
        isUser: false,
        timestamp: new Date(),
        animated: false,
        showFeedback: false,
        responseType: 'hybrid'
      };
      
      this.allMessages.set([welcomeMessage]);
    }, 1000);
  }

  // === 기존 메서드들과의 호환성 ===
  private addMessage(text: string, isUser: boolean, animated: boolean = true): EnhancedChatbotMessage {
    return this.addMessageWithFeedback(text, isUser, animated, 'static');
  }

  // === 긴급 상황 처리 ===
  private handleEmergencyQuery(query: string): void {
    const emergencyResponse = this.chatbotService.handleEmergencyQuery(query);
    if (emergencyResponse) {
      this.addMessageWithFeedback(emergencyResponse, false, true, 'static');
    }
  }

  // === 유틸리티 메서드들 ===
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

  private incrementNotificationCount(): void {
    // 채팅창이 열려있지 않을 때만 알림 카운트 증가
    if (!this.isOpen()) {
      this.notificationCount.update(count => count + 1);
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

  trackByMessageId(index: number, message: EnhancedChatbotMessage): string {
    return message.id;
  }

  // === 성능 및 관리 메서드들 ===
  clearCache(): void {
    this.responseCache.clear();
    this.chatbotService.clearCache();
  }

  resetChatbot(): void {
    this.allMessages.set([]);
    this.responseCache.clear();
    this.processedQuestCompletions.clear();
    this.lastProcessedActivityCount = 0;
    this.lastUserContext = null;
    this.chatbotService.clearCache();
    this.addWelcomeMessage();
  }

  // === 기존 알림 관련 메서드들 ===
  private loadStoredNotifications(): void {
    // 실제 저장된 알림이 있으면 로드
    // 현재는 퀘스트 완료 기반으로만 알림 생성
  }

  private clearNotifications(): void {
    this.notificationCount.set(0);
  }

  private schedulePerformanceCheck(): void {
    setInterval(() => {
      this.performPerformanceCheck();
    }, 5 * 60 * 1000); // 5분마다
  }

  private performPerformanceCheck(): void {
    // 메모리 사용량 체크
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
      if (usedMB > 50) {
        this.performCleanup();
      }
    }
    
    // 캐시 정리
    this.cleanupOldCache();
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

  private cleanupOldCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.responseCache.entries()) {
      if (now - entry.timestamp > this.CACHE_DURATION) {
        this.responseCache.delete(key);
      }
    }
  }
}