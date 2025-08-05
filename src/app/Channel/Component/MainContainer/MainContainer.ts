// MainContainer.ts - WebSocket 통합 버전
import { Component, signal, computed, effect, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { Subscription } from "rxjs";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { WebSocketChatService } from "../../Service/WebSocketChatService";
import { UserStatus } from "../../../Core/Models/user";
import { ChatMessage } from "../../Models/chatMessage";
import { DebugService } from "../../../Debug/DebugService";

@Component({
  selector: 'app-main-container',
  templateUrl: './MainContainer.html',
  styleUrl: './MainContainer.css',
  imports: [CommonModule, MatIconModule, FormsModule],
  standalone: true
})
export class MainContainerComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  // Signals
  newMessage = signal('');
  messages = signal<ChatMessage[]>([]);
  isTyping = signal(false);
  
  // Computed properties
  channelInfo = computed(() => this.sharedState.channelInfo());
  currentUserId = computed(() => this.sharedState.currentUser()?.id || '');
  currentChannel = computed(() => this.sharedState.selectedChannel() || '');
  connectionStatus = computed(() => this.webSocketService.connectionStatus());
  onlineUsers = computed(() => this.webSocketService.onlineUsers());
  typingUsersText = computed(() => 
    this.webSocketService.getTypingUsersText(this.currentChannel())
  );

  private subscriptions: Subscription[] = [];
  private typingTimer: any;

  constructor(
    public sharedState: SharedStateService,
    private webSocketService: WebSocketChatService,
    private debugService: DebugService
  ) {
    this.debugService.printConsole('MainContainerComponent initialized with WebSocket support');
    
    // 메시지가 업데이트되면 스크롤을 맨 아래로
    effect(() => {
      if (this.messages().length > 0) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });

    // 채널 변경 감지
    effect(() => {
      const currentChannel = this.currentChannel();
      if (currentChannel) {
        this.loadChannelMessages(currentChannel);
        this.webSocketService.joinChannel(currentChannel);
      }
    });

    // 연결 상태 변경 감지
    effect(() => {
      const status = this.connectionStatus();
      this.debugService.printConsole('WebSocket connection status:', status);
      
      if (status === 'connected') {
        this.loadChannelMessages(this.currentChannel());
      }
    });
  }

  ngOnInit(): void {
    this.initializeWebSocket();
    this.setupMessageSubscriptions();
  }

  ngOnDestroy(): void {
    this.webSocketService.disconnect();
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.clearTypingTimer();
  }

  // === WebSocket 초기화 ===
  private initializeWebSocket(): void {
    const user = this.sharedState.currentUser();
    if (user) {
      const wsUser: UserStatus = {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        status: 'online'
      };
      
      // WebSocket 서버 URL - 실제 환경에 맞게 수정
      const wsUrl = this.getWebSocketUrl();
      this.webSocketService.connect(wsUser, wsUrl);
    }
  }

  private getWebSocketUrl(): string {
    // 환경에 따른 WebSocket URL 설정
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.hostname === 'localhost' ? ':8080' : '';
    
    return `${protocol}//${host}${port}/chat`;
  }

  // === 메시지 구독 설정 ===
  private setupMessageSubscriptions(): void {
    // 새 메시지 수신
    const messagesSub = this.webSocketService.messages$.subscribe(message => {
      if (message.channelId === this.currentChannel()) {
        this.addMessageToChannel(message);
      }
    });

    // 사용자 입장
    const userJoinedSub = this.webSocketService.userJoined$.subscribe(user => {
      this.addSystemMessage(`${user.name}님이 입장하셨습니다.`, 'user_joined');
    });

    // 사용자 퇴장
    const userLeftSub = this.webSocketService.userLeft$.subscribe(user => {
      this.addSystemMessage(`${user.name}님이 퇴장하셨습니다.`, 'user_left');
    });

    // 오류 처리
    const errorsSub = this.webSocketService.errors$.subscribe(error => {
      this.debugService.printConsole('WebSocket error:', error);
      this.addSystemMessage(`오류: ${error}`, 'error');
    });

    this.subscriptions.push(messagesSub, userJoinedSub, userLeftSub, errorsSub);
  }

  // === 메시지 관리 ===
  private loadChannelMessages(channelId: string): void {
    // 채널별 메시지 로드 - 실제로는 서버에서 가져와야 함
    this.messages.set([]);
    
    // 임시: 기존 SharedStateService의 메시지 사용
    const existingMessages = this.sharedState.messages();
    this.messages.set(existingMessages.filter(msg => 
      !msg.channelId || msg.channelId === channelId
    ));
  }

  private addMessageToChannel(message: ChatMessage): void {
    const currentMessages = this.messages();
    this.messages.set([...currentMessages, message]);
    
    // SharedStateService에도 추가 (기존 호환성)
    this.sharedState.addMessage(message);
  }

  private addSystemMessage(content: string, type: string): void {
    const systemMessage: ChatMessage = {
      id: `system_${Date.now()}`,
      userId: 'system',
      username: 'System',
      content,
      timestamp: new Date(),
      type: type as any,
      channelId: this.currentChannel()
    };
    
    this.addMessageToChannel(systemMessage);
  }

  // === 메시지 전송 ===
  sendMessage(content: string): void {
    if (!content.trim() || this.connectionStatus() !== 'connected') return;

    const channelId = this.currentChannel();
    this.webSocketService.sendMessage(content, channelId);
    this.webSocketService.stopTyping(channelId);
  }

  sendCurrentMessage(): void {
    this.sendMessage(this.newMessage());
    this.newMessage.set('');
    this.stopTyping();
  }

  // === 타이핑 표시 ===
  onMessageInput(): void {
    if (!this.isTyping()) {
      this.isTyping.set(true);
      this.webSocketService.startTyping(this.currentChannel());
    }

    this.clearTypingTimer();
    this.typingTimer = setTimeout(() => {
      this.stopTyping();
    }, 1000);
  }

  private stopTyping(): void {
    if (this.isTyping()) {
      this.isTyping.set(false);
      this.webSocketService.stopTyping(this.currentChannel());
    }
    this.clearTypingTimer();
  }

  private clearTypingTimer(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
  }

  // === 키보드 이벤트 ===
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendCurrentMessage();
    } else {
      this.onMessageInput();
    }
  }

  // === UI 헬퍼 메서드 ===
  getWelcomeTitle(): string {
    const channelId = this.currentChannel();
    const titles: { [key: string]: string } = {
      'general': '일반 채널에 오신 것을 환영합니다!',
      'quest': '일일 퀘스트에 도전해보세요!',
      'tips': '유용한 팁을 공유해주세요!',
      'entj': 'ENTJ들의 특별한 공간입니다!',
      'estp': 'ESTP들의 에너지 넘치는 공간!',
      'samyang': '삼양인들만의 특별한 공간!',
      'workout': '운동 목표를 달성해보세요!',
      'study': '공부 습관을 만들어가요!'
    };
    
    return titles[channelId || ''] || '채널에 오신 것을 환영합니다!';
  }

  getWelcomeMessage(): string {
    const onlineCount = this.onlineUsers().length;
    const channelId = this.currentChannel();
    const baseMessage = this.getChannelDescription(channelId);
    
    return `${baseMessage}\n현재 ${onlineCount}명이 온라인입니다.`;
  }

  private getChannelDescription(channelId: string): string {
    const messages: { [key: string]: string } = {
      'general': '자유롭게 대화를 나누고 서로의 경험을 공유해보세요.',
      'quest': '매일 새로운 도전과 퀘스트를 함께 완료해나가요.',
      'tips': '돈 안 쓰고 갓생 살기 위한 꿀팁들을 나눠주세요.',
      'entj': '계획적이고 체계적인 ENTJ만의 라이프스타일을 공유해주세요.',
      'estp': '활동적이고 역동적인 ESTP들의 이야기를 들려주세요.',
      'samyang': '삼양인들만이 아는 특별한 경험과 이야기를 나눠주세요.',
      'workout': '운동 목표를 설정하고 함께 달성해나가요.',
      'study': '공부 계획을 세우고 꾸준히 실천하는 방법을 공유해요.'
    };
    
    return messages[channelId || ''] || '대화를 시작해보세요!';
  }

  getConversationStarters(): string[] {
    const channelId = this.currentChannel();
    const starters: { [key: string]: string[] } = {
      'general': [
        '안녕하세요! 👋',
        '오늘 어떤 갓생을 살았나요?',
        '0원으로 할 수 있는 재미있는 일 추천해주세요!'
      ],
      'quest': [
        '오늘의 퀘스트가 뭔가요?',
        '퀘스트 완료 인증합니다! ✅',
        '새로운 퀘스트 아이디어 있어요!'
      ],
      'tips': [
        '돈 안 쓰는 꿀팁 공유합니다!',
        '이런 팁은 어떠세요?',
        '질문이 있어요!'
      ],
      'entj': [
        'ENTJ 특유의 계획 세우는 법',
        '효율적인 하루 루틴 공유',
        '목표 달성 전략'
      ],
      'estp': [
        'ESTP의 에너지 넘치는 하루',
        '즉흥적인 재미있는 경험',
        '활동적인 갓생 아이디어'
      ],
      'samyang': [
        '삼양인의 특별한 하루',
        '삼양만의 독특한 경험',
        '삼양 문화 이야기'
      ],
      'workout': [
        '오늘 운동 완료! 💪',
        '운동 동기 부여해주세요',
        '효과적인 운동법 추천'
      ],
      'study': [
        '오늘 공부 목표 달성! 📚',
        '집중력 높이는 방법',
        '공부 계획 공유'
      ]
    };
    
    return starters[channelId || ''] || ['안녕하세요!', '대화를 시작해볼까요?'];
  }

  getInputPlaceholder(): string {
    const status = this.connectionStatus();
    if (status !== 'connected') {
      return '연결 중...';
    }

    const channelId = this.currentChannel();
    const placeholders: { [key: string]: string } = {
      'general': '자유롭게 메시지를 입력하세요...',
      'quest': '퀘스트 관련 메시지를 입력하세요...',
      'tips': '유용한 팁을 공유해주세요...',
      'entj': 'ENTJ들과 이야기를 나눠보세요...',
      'estp': 'ESTP들과 대화해보세요...',
      'samyang': '삼양인들과 소통해보세요...',
      'workout': '운동 관련 메시지를 입력하세요...',
      'study': '공부 관련 이야기를 나눠보세요...'
    };
    
    return placeholders[channelId || ''] || '메시지를 입력하세요...';
  }

  formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) {
      return `${days}일 전`;
    } else if (hours > 0) {
      return `${hours}시간 전`;
    } else if (minutes > 0) {
      return `${minutes}분 전`;
    } else {
      return '방금 전';
    }
  }

  getConnectionStatusText(): string {
    const status = this.connectionStatus();
    const statusTexts = {
      'connecting': '연결 중...',
      'connected': '연결됨',
      'disconnected': '연결 끊김',
      'reconnecting': '재연결 중...'
    };
    return statusTexts[status] || '알 수 없음';
  }

  getConnectionStatusClass(): string {
    return `connection-${this.connectionStatus()}`;
  }

  isUserOnline(userId: string): boolean {
    return this.webSocketService.isUserOnline(userId);
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  // === 연결 관리 ===
  reconnect(): void {
    this.webSocketService.disconnect();
    setTimeout(() => {
      this.initializeWebSocket();
    }, 1000);
  }

  updateUserStatus(status: 'online' | 'away' | 'offline'): void {
    this.webSocketService.updateStatus(status);
  }

  // === 파일 업로드 (확장 기능) ===
  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.uploadFile(file);
    }
  }

  private uploadFile(file: File): void {
    // 파일 업로드 로직 구현
    this.debugService.printConsole('File upload requested:', file.name);
    // 실제 구현에서는 파일을 서버에 업로드하고 메시지로 전송
  }

  // === 이모지/리액션 (확장 기능) ===
  addReaction(messageId: string, emoji: string): void {
    // 리액션 추가 로직
    this.debugService.printConsole('Reaction added:', messageId, emoji);
  }

  // === 메시지 검색 (확장 기능) ===
  searchMessages(query: string): ChatMessage[] {
    return this.messages().filter(msg => 
      msg.content.toLowerCase().includes(query.toLowerCase())
    );
  }
}