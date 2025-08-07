// FloatingChatbot.ts
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subject, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChatbotService, UserActivityContext } from '../../Service/ChatbotService';

interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  animated?: boolean;
}

interface UserContext {
  hasJoinedGroups: boolean;
  activeTab: string;
  selectedGroup: string | null;
  selectedChannel: string | null;
  userName?: string;
  initialized: boolean;
}

@Component({
  selector: 'app-chatbot',
  templateUrl: './Chatbot.html',
  styleUrl: './Chatbot.css',
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule],
  standalone: true
})
export class ChatbotComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() userContext: UserContext | null = null;
  @Output() messageInteraction = new EventEmitter<{
    input: string;
    response: string;
    feedback?: 'helpful' | 'unhelpful';
  }>();

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = false;

  // 상태 관리
  isOpen = false;
  isMinimized = false;
  isTyping = false;
  hasInteracted = false;
  inputText = '';
  messages: ChatMessage[] = [];
  quickQuestions = ['내 통계', '연속 기록', '퀘스트 현황', '그룹 가입', '도움말'];

  // 매크로 응답 시스템 (폴백용)
  private macroResponses: { [key: string]: string } = {
    '그룹': '좌측 사이드바에서 "그룹 참여하기" 버튼을 클릭하세요! 🎯',
    '가입': '홈 화면에서 원하는 그룹을 선택하고 참여 버튼을 누르면 됩니다! ✨',
    '참여': '그룹에 참여하려면 홈 화면의 그룹 목록에서 원하는 그룹을 선택하세요!',
    '퀘스트': '각 그룹의 일일 미션을 완료하여 포인트를 획득하세요! 🏆',
    '미션': '그룹 대시보드에서 오늘의 미션을 확인하고 체크해보세요! 📋',
    '목표': '개인 목표와 그룹 목표를 설정하여 함께 달성해나가세요!',
    '통계': '상단 메뉴의 "통계" 탭에서 진행상황을 확인할 수 있어요! 📊',
    '진행': '활동 탭에서 개인 및 그룹의 진행률을 한눈에 볼 수 있습니다!',
    '연속': '꾸준한 활동으로 연속 기록을 늘려보세요! 🔥',
    '스트릭': '매일 활동하여 멋진 연속 기록을 만들어보세요!',
    '포인트': '다양한 활동을 통해 포인트를 획득하고 순위를 높여보세요! ⭐',
    '도움': '구체적으로 어떤 부분이 궁금하신가요? "그룹 가입", "퀘스트", "통계" 등에 대해 물어보세요! 🤝',
    '사용법': '좌측 메뉴에서 원하는 기능을 선택하거나, 상단 검색으로 찾을 수 있어요!',
    '안녕': '안녕하세요! 무엇을 도와드릴까요? 😊',
    '감사': '천만에요! 다른 궁금한 것이 있으면 언제든 물어보세요! 🙂'
  };

  constructor(private chatbotService: ChatbotService) {}

  ngOnInit(): void {
    this.initializeChat();
    this.checkUserInteraction();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  private initializeChat(): void {
    const welcomeMessage: ChatMessage = {
      id: '1',
      text: this.getWelcomeMessage(),
      isUser: false,
      timestamp: new Date()
    };
    this.messages = [welcomeMessage];
  }

  private getWelcomeMessage(): string {
    const userName = this.userContext?.userName || '사용자';
    const hasGroups = this.userContext?.hasJoinedGroups;
    
    if (hasGroups === false) {
      return `안녕하세요 ${userName}님! 🎯\n아직 참여한 그룹이 없으시네요. "그룹 가입"에 대해 물어보시면 도와드릴게요!`;
    } else if (hasGroups === true) {
      return `안녕하세요 ${userName}님! 😊\n오늘도 목표 달성을 위해 화이팅하세요! 궁금한 것이 있으면 언제든 물어보세요.`;
    } else {
      return `안녕하세요! 무엇을 도와드릴까요? 😊\n"그룹 가입", "퀘스트", "통계" 등에 대해 물어보세요!`;
    }
  }

  private checkUserInteraction(): void {
    // 5초 후에 아직 상호작용이 없으면 bounce 애니메이션 중지
    timer(5000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (!this.hasInteracted) {
        this.hasInteracted = true;
      }
    });
  }

  openChatbot(): void {
    this.isOpen = true;
    this.markAsInteracted();
    
    // 포커스를 입력 필드에 설정
    setTimeout(() => {
      if (this.messageInput) {
        this.messageInput.nativeElement.focus();
      }
    }, 100);
  }

  closeChatbot(): void {
    this.isOpen = false;
    this.isMinimized = false;
  }

  toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
  }

  markAsInteracted(): void {
    this.hasInteracted = true;
  }

  sendMessage(): void {
    if (!this.inputText.trim() || this.isTyping) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: this.inputText,
      isUser: true,
      timestamp: new Date()
    };

    this.messages.push(userMessage);
    this.shouldScrollToBottom = true;

    const userInput = this.inputText;
    this.inputText = '';
    this.isTyping = true;

    // 봇 응답 생성 (비동기 처리)
    this.generateBotResponse(userInput);
  }

  sendQuickQuestion(question: string): void {
    this.inputText = question;
    this.sendMessage();
  }

  private generateBotResponse(userInput: string): void {
    const delay = 800 + Math.random() * 1200; // 0.8 ~ 2초
    
    timer(delay).pipe(takeUntil(this.destroy$)).subscribe(async () => {
      let response: string;
      
      try {
        // 비동기 응답 생성
        response = await this.generateResponse(userInput);
        
        // 응답이 빈 문자열이거나 undefined인 경우 기본 응답 사용
        if (!response || response.trim().length === 0) {
          response = this.getDefaultResponse();
        }
        
      } catch (error) {
        console.error('Error generating bot response:', error);
        response = '죄송해요, 일시적인 오류가 발생했습니다. 다시 시도해 주세요! 😅';
      }
      
      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: response,
        isUser: false,
        timestamp: new Date(),
        animated: true
      };

      this.messages.push(botMessage);
      this.isTyping = false;
      this.shouldScrollToBottom = true;

      // 상호작용 이벤트 발생
      this.messageInteraction.emit({
        input: userInput,
        response: response
      });
    });
  }

  private async generateResponse(input: string): Promise<string> {
    try {
      // ChatbotService 사용 (활동 데이터 포함)
      if (this.chatbotService && this.userContext) {
        const response = await this.chatbotService.generateResponseWithActivity(input, this.userContext);
        return response;
      }
    } catch (error) {
      console.error('Error using ChatbotService:', error);
      // 폴백으로 기본 응답 사용
    }
    
    // 기본 응답 로직 (폴백) - 동기 처리이므로 바로 반환
    return this.generateBasicResponse(input);
  }

  private generateBasicResponse(input: string): string {
    const inputLower = input.toLowerCase().trim();
    
    // 사용자 컨텍스트 기반 맞춤 응답
    const contextualResponse = this.getContextualResponse(inputLower);
    if (contextualResponse) {
      return contextualResponse;
    }

    // 키워드 매칭
    for (const [keyword, response] of Object.entries(this.macroResponses)) {
      if (inputLower.includes(keyword.toLowerCase())) {
        return response;
      }
    }

    // 패턴 매칭
    if (this.containsPattern(inputLower, ['어떻게', '방법'])) {
      return '구체적으로 어떤 것에 대한 방법이 궁금하신가요? "그룹 가입 방법"이나 "퀘스트 완료 방법" 등으로 물어보세요! 🤔';
    }

    if (this.containsPattern(inputLower, ['없어', '안돼', '모르겠'])) {
      return '괜찮아요! 천천히 알아가시면 됩니다. 구체적으로 어떤 부분이 어려우신지 말씀해 주세요! 💪';
    }

    // 기본 응답
    return this.getDefaultResponse();
  }

  private getContextualResponse(input: string): string | null {
    const context = this.userContext;
    if (!context) return null;

    // 그룹 미참여 상태에서 그룹 관련 질문
    if (!context.hasJoinedGroups && (input.includes('그룹') || input.includes('가입'))) {
      return '아직 참여한 그룹이 없으시네요! 홈 화면의 "그룹 참여하기" 버튼을 눌러서 관심 있는 그룹에 참여해보세요! 🎯\n\n함께 목표를 달성할 동료들을 만나실 수 있어요!';
    }

    // 그룹 탭에 있을 때 퀘스트 질문
    if (context.activeTab === 'group' && (input.includes('퀘스트') || input.includes('미션'))) {
      return '현재 그룹 페이지에 계시네요! 바로 여기서 오늘의 퀘스트를 확인하고 완료할 수 있어요! 📋\n\n체크박스를 클릭해서 미션을 완료해보세요!';
    }

    // 통계 관련 질문
    if (input.includes('통계') || input.includes('진행')) {
      return '상단 메뉴의 "통계" 탭에서 개인 및 그룹의 진행상황을 자세히 볼 수 있어요! 📊\n\n일별, 주별, 월별 성과를 한눈에 확인해보세요!';
    }

    return null;
  }

  private containsPattern(input: string, patterns: string[]): boolean {
    return patterns.some(pattern => input.includes(pattern));
  }

  private getDefaultResponse(): string {
    const defaultResponses = [
      '죄송해요, 잘 이해하지 못했어요. 다시 말씀해 주시겠어요? 😅',
      '좀 더 구체적으로 말씀해 주세요. "그룹 가입"이나 "퀘스트" 같은 키워드로 물어보세요! 🤖',
      '아직 그 질문에 대한 답변을 준비하지 못했어요. 다른 것을 물어보시겠어요? 💭',
      '잘 모르겠어요! 아래 빠른 질문 버튼을 사용해보시거나, 다르게 표현해서 물어보세요! ✨'
    ];
    
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const container = this.messagesContainer.nativeElement;
      container.scrollTop = container.scrollHeight;
    }
  }
}