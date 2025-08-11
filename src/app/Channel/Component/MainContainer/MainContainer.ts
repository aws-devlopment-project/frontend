// FixedMainContainer.ts - 백엔드 예시에 맞춘 수정
import { Component, signal, computed, effect, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { Subscription } from "rxjs";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { StompWebSocketService } from "../../Service/WebSocketChatService";
import { ChatMessageDto, ChatHistory } from "../../Models/chatMessage";

interface DisplayMessage {
  id: string;
  senderEmail: string;
  senderUsername: string;
  content: string;
  timestamp: Date;
  type: 'user' | 'system';
  messageType: 'CHAT' | 'JOIN' | 'LEAVE' | 'IMAGE';
  isOwn: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

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
  @ViewChild('fileInput') fileInput!: ElementRef;

  // Signals
  newMessage = signal('');
  messages = signal<DisplayMessage[]>([]);
  
  // Computed properties
  channelInfo = computed(() => this.sharedState.channelInfo());
  currentUserEmail = computed(() => this.sharedState.currentUser()?.id || '');
  currentUsername = computed(() => this.sharedState.currentUser()?.name || '');
  currentChannel = computed(() => {
      return this.sharedState.clubList().find(c => c.name === this.sharedState.selectedChannel()) || {id: -1, name: '', groupId: ''};
    }
  );
  currentGroup = computed(() => {
      return this.sharedState.groupList().find(g => g.name === this.sharedState.selectedGroup()) || {id: -1, name: ''};
    }
  );
  connectionStatus = computed(() => this.stompWebSocketService.connectionStatus());
  
  // 채팅방 ID 생성 (clubId를 숫자로 변환)
  chatRoomId = computed(() => {
    const group = this.currentGroup().id;
    const channel = this.currentChannel().id;
    if (!group || !channel) return -1;
    
    // group과 channel을 기반으로 숫자 ID 생성 (간단한 해시)
    const combined = `${group}-${channel}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit 정수로 변환
    }
    return Math.abs(hash);
  });

  // 저장된 메시지 통계
  messageStats = computed(() => {
    const group = this.currentGroup();
    const channel = this.currentChannel();
    if (!group || !channel) return { count: 0, rooms: [] };
    
    return {
      count: this.stompWebSocketService.getChatMessageCount(group.name, channel.name),
      rooms: this.stompWebSocketService.getAllChatRooms()
    };
  });

  private subscriptions: Subscription[] = [];
  private messageIdCounter = 0;

  constructor(
    public sharedState: SharedStateService,
    private stompWebSocketService: StompWebSocketService
  ) {
    console.log('Fixed MainContainerComponent initialized with STOMP (Backend Compatible)');
    
    // 메시지가 업데이트되면 스크롤을 맨 아래로
    effect(() => {
      if (this.messages().length > 0) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });

    // 채널 변경 감지
    effect(() => {
      const clubId = this.chatRoomId();
      const userEmail = this.currentUserEmail();
      const username = this.currentUsername();
      
      if (clubId !== -1 && userEmail && username) {
        this.loadChannelMessages();
        this.stompWebSocketService.joinRoom(clubId, userEmail, username);
      }
    });

    // 연결 상태 변경 감지
    effect(() => {
      const status = this.connectionStatus();
      console.log('STOMP connection status:', status);
      
      if (status === 'connected') {
        this.addSystemMessage('STOMP 서버에 연결되었습니다.');
      } else if (status === 'disconnected') {
        this.addSystemMessage('STOMP 서버와의 연결이 끊어졌습니다.');
      }
    });
  }

  ngOnInit(): void {
    this.initializeStompConnection();
    this.setupMessageSubscriptions();
  }

  ngOnDestroy(): void {
    this.stompWebSocketService.disconnect();
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // STOMP 연결 초기화
  private initializeStompConnection(): void {
    const user = this.sharedState.currentUser();
    if (user && user.id) {
      const serverUrl = this.getServerUrl();
      this.stompWebSocketService.connect(user.id, user.name, serverUrl);
    }
  }

  private getServerUrl(): string {
    return 'http://localhost:9001'; // 백엔드 예시와 동일한 포트
  }

  // 메시지 구독 설정
  private setupMessageSubscriptions(): void {
    const messagesSub = this.stompWebSocketService.messages$.subscribe((message: ChatMessageDto) => {
      this.addDisplayMessage(message);
    });

    const errorsSub = this.stompWebSocketService.errors$.subscribe((error: string) => {
      console.error('STOMP error:', error);
      this.addSystemMessage(`오류: ${error}`);
    });

    this.subscriptions.push(messagesSub, errorsSub);
  }

  // 채널 메시지 로드
  private loadChannelMessages(): void {
    this.messages.set([]);
  }

  // 디스플레이 메시지 추가
  private addDisplayMessage(message: ChatMessageDto): void {
    if (message.message === 'ping') {
      return;
    }

    const displayMessage: DisplayMessage = {
      id: this.generateMessageId(),
      senderEmail: message.senderEmail,
      senderUsername: message.senderUsername,
      content: message.message, // 백엔드 예시에 맞춰 'message' 필드 사용
      timestamp: new Date(message.timestamp || Date.now()),
      type: this.getDisplayType(message.type),
      messageType: message.type,
      isOwn: message.senderEmail === this.currentUserEmail() || 
             message.senderUsername === this.currentUsername()
    };
    
    this.messages.update(messages => [...messages, displayMessage]);
  }

  // 메시지 타입을 디스플레이 타입으로 변환
  private getDisplayType(messageType: 'CHAT' | 'JOIN' | 'LEAVE' | 'IMAGE'): 'user' | 'system' {
    return (messageType === 'JOIN' || messageType === 'LEAVE') ? 'system' : 'user';
  }

  // 시스템 메시지 추가
  private addSystemMessage(content: string): void {
    const systemMessage: DisplayMessage = {
      id: this.generateMessageId(),
      senderEmail: 'system',
      senderUsername: 'System',
      content,
      timestamp: new Date(),
      type: 'system',
      messageType: 'CHAT',
      isOwn: false
    };
    
    this.messages.update(messages => [...messages, systemMessage]);
  }

  // 메시지 ID 생성
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }

  // 메시지 전송
  sendMessage(content: string): void {
    if (!content.trim() || !this.stompWebSocketService.isConnected()) {
      if (!this.stompWebSocketService.isConnected()) {
        this.addSystemMessage('서버에 연결되지 않았습니다. 연결을 확인해주세요.');
      }
      return;
    }

    const clubId = this.chatRoomId();
    const userEmail = this.currentUserEmail();
    const username = this.currentUsername();

    if (clubId !== -1 && userEmail && username) {
      this.stompWebSocketService.sendChatMessage(clubId, userEmail, username, content);
    }
  }

  sendCurrentMessage(): void {
    this.sendMessage(this.newMessage());
    this.newMessage.set('');
  }

  // 파일 업로드
  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.uploadFile(file);
    }
  }

  private uploadFile(file: File): void {
    if (!this.stompWebSocketService.isConnected()) {
      this.addSystemMessage('연결이 끊어져 파일을 업로드할 수 없습니다');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      this.addSystemMessage('파일 크기는 5MB를 초과할 수 없습니다');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      const clubId = this.chatRoomId();
      const userEmail = this.currentUserEmail();
      const username = this.currentUsername();

      if (clubId !== -1 && userEmail && username) {
        const fileInfo = {
          name: file.name,
          size: file.size,
          type: file.type,
          data: base64Data
        };
        
        this.stompWebSocketService.sendImageMessage(
          clubId, userEmail, username, JSON.stringify(fileInfo)
        );
        
        this.addSystemMessage(`파일 업로드: ${file.name} (${this.formatFileSize(file.size)})`);
      }
    };
    
    reader.onerror = () => {
      this.addSystemMessage('파일 읽기 오류가 발생했습니다');
    };
    
    reader.readAsDataURL(file);
  }

  // 키보드 이벤트
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendCurrentMessage();
    }
  }

  // UI 헬퍼 메서드들
  getWelcomeTitle(): string {
    const channelId = this.currentChannel();
    const titles: Record<string, string> = {
      'general': '일반 채널에 오신 것을 환영합니다!',
      'quest': '일일 퀘스트에 도전해보세요!',
      'tips': '유용한 팁을 공유해주세요!',
      'entj': 'ENTJ들의 특별한 공간입니다!',
      'estp': 'ESTP들의 에너지 넘치는 공간!',
      'samyang': '삼양인들만의 특별한 공간!',
      'workout': '운동 목표를 달성해보세요!',
      'study': '공부 습관을 만들어가요!'
    };
    
    return titles[channelId.name || ''] || '채널에 오신 것을 환영합니다!';
  }

  getWelcomeMessage(): string {
    const channelId = this.currentChannel();
    const baseMessage = this.getChannelDescription(channelId.name);
    const stats = this.messageStats();
    const clubId = this.chatRoomId();
    
    return `${baseMessage}\n\n채팅방 ID: ${clubId}\n메모리에 ${stats.count}개의 메시지가 저장되어 있습니다.\nSTOMP를 통해 실시간으로 소통해보세요!`;
  }

  public getChannelDescription(channelId: string): string {
    const messages: Record<string, string> = {
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
    const starters: Record<string, string[]> = {
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
      ]
    };
    
    return starters[channelId.name || ''] || ['안녕하세요!', '대화를 시작해볼까요?', '좋은 하루 보내세요!'];
  }

  getInputPlaceholder(): string {
    const status = this.connectionStatus() as ConnectionStatus;
    if (status !== 'connected') {
      const statusText: Record<ConnectionStatus, string> = {
        'connecting': '서버에 연결 중...',
        'reconnecting': '재연결 중...',
        'disconnected': '서버 연결 끊김',
        'connected': ''
      };
      return statusText[status] || '연결 중...';
    }

    return '메시지를 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)';
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getConnectionStatusText(): string {
    const status = this.connectionStatus() as 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
    const statusTexts: Record<string, string> = {
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

  // 이미지 메시지 확인
  isImageMessage(message: DisplayMessage): boolean {
    return message.messageType === 'IMAGE';
  }

  // 시각적 메시지 확인 (CHAT 또는 IMAGE)
  isVisualMessage(message: DisplayMessage): boolean {
    return message.messageType === 'CHAT' || message.messageType === 'IMAGE';
  }

  // 시스템 메시지 확인 (JOIN 또는 LEAVE)
  isSystemMessage(message: DisplayMessage): boolean {
    return message.messageType === 'JOIN' || message.messageType === 'LEAVE';
  }

  // 이미지 데이터 파싱
  getImageData(message: DisplayMessage): any {
    if (!this.isImageMessage(message)) return null;
    
    try {
      return JSON.parse(message.content);
    } catch {
      return null;
    }
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  // 연결 관리
  reconnect(): void {
    this.addSystemMessage('STOMP 서버에 재연결을 시도합니다...');
    this.stompWebSocketService.disconnect();
    setTimeout(() => {
      this.initializeStompConnection();
    }, 1000);
  }

  // 현재 채널 채팅 이력 삭제
  clearCurrentChannelHistory(): void {
    const group = this.currentGroup();
    const channel = this.currentChannel();
    
    if (group && channel) {
      this.stompWebSocketService.clearChatHistory(group.name, channel.name);
      this.messages.set([]);
      this.addSystemMessage('채팅 이력이 삭제되었습니다.');
    }
  }

  // 모든 채팅 이력 삭제
  clearAllHistory(): void {
    this.stompWebSocketService.clearAllChatHistory();
    this.messages.set([]);
    this.addSystemMessage('모든 채팅 이력이 삭제되었습니다.');
  }

  // 파일 다운로드
  downloadFile(message: DisplayMessage): void {
    if (!this.isImageMessage(message)) return;
    
    const fileData = this.getImageData(message);
    if (!fileData) return;

    try {
      const link = document.createElement('a');
      link.href = fileData.data;
      link.download = fileData.name || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.addSystemMessage(`파일 다운로드: ${fileData.name}`);
    } catch (error) {
      this.addSystemMessage('파일 다운로드 중 오류가 발생했습니다.');
    }
  }

  // 이미지 미리보기
  previewImage(message: DisplayMessage): void {
    if (!this.isImageMessage(message)) return;
    
    const fileData = this.getImageData(message);
    if (!fileData || !fileData.type.startsWith('image/')) return;

    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(`
        <html>
          <head><title>이미지 미리보기 - ${fileData.name}</title></head>
          <body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0;">
            <img src="${fileData.data}" alt="${fileData.name}" style="max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
          </body>
        </html>
      `);
    }
  }

  // 개발용 데모 메시지 추가
  addDemoMessage(): void {
    const demoMessages = [
      '안녕하세요! STOMP 테스트 메시지입니다.',
      'STOMP over WebSocket 연결이 정상적으로 작동하고 있나요?',
      '파일 업로드 기능도 테스트해보세요!',
      '실시간 STOMP 채팅을 즐겨보세요! 🎉'
    ];
    
    const randomMessage = demoMessages[Math.floor(Math.random() * demoMessages.length)];
    this.sendMessage(randomMessage);
  }

  // 통계 정보 표시
  showStats(): void {
    const stats = this.messageStats();
    const clubId = this.chatRoomId();
    this.addSystemMessage(`채팅방 ID: ${clubId}, 현재 채널 메시지: ${stats.count}개, 전체 채팅방: ${stats.rooms.length}개`);
  }

  // 연결 테스트
  testConnection(): void {
    if (this.stompWebSocketService.isConnected()) {
      const clubId = this.chatRoomId();
      this.addSystemMessage(`✅ STOMP 연결이 정상입니다. (채팅방 ID: ${clubId})`);
    } else {
      this.addSystemMessage('❌ STOMP 연결이 끊어졌습니다. 재연결을 시도해주세요.');
    }
  }
}