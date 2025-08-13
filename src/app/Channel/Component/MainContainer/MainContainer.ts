// MainContainer.ts - 최소한의 이미지 전송 지원 추가
import { Component, signal, computed, effect, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { Subscription } from "rxjs";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { StompWebSocketService } from "../../Service/WebSocketChatService";
import { ChatMessageDto } from "../../Models/chatMessage";

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

@Component({
  selector: 'app-main-container',
  templateUrl: './MainContainer.html',
  styleUrl: './MainContainer.css',
  imports: [CommonModule, MatIconModule, FormsModule],
  standalone: true
})
export class MainContainerComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // Signals
  newMessage = signal('');
  messages = signal<DisplayMessage[]>([]);
  isUploadingImage = signal(false);
  
  // Computed properties - SharedService의 currentChannelWithId 사용
  currentUserEmail = computed(() => this.sharedState.currentUser()?.id || '');
  currentUsername = computed(() => this.sharedState.currentUser()?.name || '');
  
  // 실제 clubId를 반환하는 computed
  currentChannel = computed(() => {
    const channelInfo = this.sharedState.currentChannelWithId();
    console.log('Current channel computed:', channelInfo);
    return channelInfo;
  });
  
  connectionStatus = computed(() => this.stompWebSocketService.connectionStatus());
  
  // 실제 clubId 반환
  chatRoomId = computed(() => {
    const channel = this.currentChannel();
    console.log('Chat room ID computed:', {
      channelInfo: channel,
      clubId: channel.id
    });
    return channel.id;
  });

  private subscriptions: Subscription[] = [];
  private messageIdCounter = 0;

  constructor(
    public sharedState: SharedStateService,
    private stompWebSocketService: StompWebSocketService
  ) {
    console.log('MainContainer 초기화');
    
    // 메시지 업데이트 시 스크롤
    effect(() => {
      if (this.messages().length > 0) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });

    // 채널 변경 감지 - 더 상세한 로깅
    effect(() => {
      const channel = this.currentChannel();
      const userEmail = this.currentUserEmail();
      const username = this.currentUsername();
      
      console.log('🔄 ===== 채널 변경 감지 =====');
      console.log('📋 채널 정보:', {
          clubId: channel.id,
          clubName: channel.name,
          groupId: channel.groupId,
          isValidClubId: channel.id !== -1
      });
      console.log('📋 사용자 정보:', { userEmail, username });
      
      // 채팅방 입장 조건 체크
      const canJoinChat = channel.id !== -1 && userEmail && username;
      console.log('🚪 채팅방 입장 가능:', canJoinChat);
      
      if (canJoinChat) {
          console.log('✅ 채팅방 입장 조건 충족');
          
          // 메시지 초기화
          this.messages.set([]);
          
          // WebSocket 서비스에 채팅방 입장 요청
          this.stompWebSocketService.joinRoom(
              channel.id,      // 실제 clubId
              userEmail,       // 사용자 이메일
              username,        // 사용자 이름
              channel.name,    // 채널 이름
              String(channel.groupId) // 그룹 ID
          );
          
          console.log('🚪 채팅방 입장 요청 완료');
      } else {
          console.log('❌ 채팅방 입장 조건 미충족');
      }
      
      console.log('🔄 ===== 채널 변경 감지 완료 =====');
    });

    // 연결 상태 변경 감지
    effect(() => {
      const status = this.connectionStatus();
      console.log('연결 상태 변경:', status);
      
      if (status === 'connected') {
        this.addSystemMessage('서버에 연결되었습니다.');
      } else if (status === 'disconnected') {
        this.addSystemMessage('서버와의 연결이 끊어졌습니다.');
      }
    });
  }

  ngOnInit(): void {
    console.log('MainContainer ngOnInit');
    
    // 디버깅을 위한 초기 상태 로그
    setTimeout(() => {
      this.debugCurrentState();
    }, 1000);
    
    this.initializeConnection();
    this.setupMessageSubscriptions();
  }

  ngOnDestroy(): void {
    console.log('MainContainer ngOnDestroy');
    this.stompWebSocketService.disconnect();
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // STOMP 연결 초기화
  private initializeConnection(): void {
    const user = this.sharedState.currentUser();
    if (user && user.id) {
      console.log('STOMP 연결 초기화:', { userEmail: user.id, username: user.name });
      this.stompWebSocketService.connect(user.id, user.name, 'http://k8s-stage-appingre-fec57c3d21-1092138479.ap-northeast-2.elb.amazonaws.com');
    }
  }

  // 메시지 구독 설정
  private setupMessageSubscriptions(): void {
    const messagesSub = this.stompWebSocketService.messages$.subscribe((message: ChatMessageDto) => {
      console.log('메시지 수신:', message);
      this.addDisplayMessage(message);
    });

    const errorsSub = this.stompWebSocketService.errors$.subscribe((error: string) => {
      console.error('STOMP 오류:', error);
      this.addSystemMessage(`오류: ${error}`);
    });

    this.subscriptions.push(messagesSub, errorsSub);
  }

  // 디스플레이 메시지 추가 - 이미지 지원
  private addDisplayMessage(message: ChatMessageDto): void {
    if (!message.message || message.message === 'ping') {
      return;
    }

    const displayMessage: DisplayMessage = {
      id: this.generateMessageId(),
      senderEmail: message.senderEmail,
      senderUsername: message.senderUsername,
      content: message.message, // 🖼️ 이미지의 경우 Base64 데이터가 여기에 들어감
      timestamp: new Date(message.timestamp || Date.now()),
      type: (message.type === 'JOIN' || message.type === 'LEAVE') ? 'system' : 'user',
      messageType: message.type,
      isOwn: message.senderEmail === this.currentUserEmail() || 
             message.senderUsername === this.currentUsername()
    };
    
    console.log('디스플레이 메시지 추가:', {
      type: displayMessage.messageType,
      isImage: displayMessage.messageType === 'IMAGE',
      contentLength: displayMessage.content.length
    });
    
    this.messages.update(messages => [...messages, displayMessage]);
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
    if (!content.trim()) return;

    if (!this.stompWebSocketService.isConnected()) {
      this.addSystemMessage('서버에 연결되지 않았습니다.');
      return;
    }

    const clubId = this.chatRoomId();
    const userEmail = this.currentUserEmail();
    const username = this.currentUsername();

    if (clubId !== -1 && userEmail && username) {
      console.log('메시지 전송:', { clubId, userEmail, username, content });
      this.stompWebSocketService.sendChatMessage(clubId, userEmail, username, content);
    } else {
      console.warn('메시지 전송 실패:', { 
        clubId, 
        userEmail, 
        username, 
        reason: clubId === -1 ? 'Invalid club ID' : 'Missing user info' 
      });
      this.addSystemMessage('메시지를 전송할 수 없습니다. 채널을 다시 선택해주세요.');
    }
  }

  // 🖼️ 이미지 선택 트리거
  triggerImageUpload(): void {
    if (!this.stompWebSocketService.isConnected()) {
      this.addSystemMessage('서버에 연결되지 않았습니다.');
      return;
    }

    if (this.isUploadingImage()) {
      this.addSystemMessage('이미지 업로드 중입니다. 잠시 기다려주세요.');
      return;
    }

    this.fileInput.nativeElement.click();
  }

  // 🖼️ 이미지 파일 선택 처리
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    console.log('이미지 파일 선택됨:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    this.uploadImage(file);
    
    // 파일 입력 초기화 (같은 파일 재선택 가능하도록)
    input.value = '';
  }

  // 🖼️ 이미지 업로드 처리
  private async uploadImage(file: File): Promise<void> {
    const clubId = this.chatRoomId();
    const userEmail = this.currentUserEmail();
    const username = this.currentUsername();

    if (clubId === -1 || !userEmail || !username) {
      this.addSystemMessage('채널을 선택하고 로그인 후 이미지를 전송할 수 있습니다.');
      return;
    }

    this.isUploadingImage.set(true);
    
    try {
      console.log('이미지 업로드 시작:', {
        fileName: file.name,
        fileSize: file.size,
        clubId,
        userEmail,
        username
      });

      // 임시 업로딩 메시지 표시
      const uploadingMessage: DisplayMessage = {
        id: this.generateMessageId(),
        senderEmail: userEmail,
        senderUsername: username,
        content: `이미지 업로드 중... (${file.name})`,
        timestamp: new Date(),
        type: 'user',
        messageType: 'CHAT',
        isOwn: true
      };
      
      this.messages.update(messages => [...messages, uploadingMessage]);

      // WebSocket 서비스를 통해 이미지 전송
      await this.stompWebSocketService.sendImageMessage(clubId, userEmail, username, file);
      
      // 업로딩 메시지 제거
      this.messages.update(messages => 
        messages.filter(msg => msg.id !== uploadingMessage.id)
      );

      console.log('✅ 이미지 업로드 성공');
      
    } catch (error) {
      console.error('❌ 이미지 업로드 실패:', error);
      
      // 업로딩 메시지 제거
      this.messages.update(messages => 
        messages.filter(msg => msg.content.includes('이미지 업로드 중...'))
      );
      
      this.addSystemMessage(`이미지 업로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      this.isUploadingImage.set(false);
    }
  }

  // 🖼️ 이미지 URL 생성 (Base64 데이터를 img src로 사용)
  getImageUrl(base64Data: string): string {
    // 이미 data:image 형태인 경우 그대로 반환
    if (base64Data.startsWith('data:image/')) {
      return base64Data;
    }
    // 순수 Base64인 경우 접두사 추가
    return `data:image/jpeg;base64,${base64Data}`;
  }

  // 🖼️ 이미지인지 확인
  isImageMessage(message: DisplayMessage): boolean {
    return message.messageType === 'IMAGE';
  }

  // 🖼️ 이미지 로드 에러 처리
  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBFcnJvcjwvdGV4dD48L3N2Zz4=';
  }

  sendCurrentMessage(): void {
    const messageContent = this.newMessage();
    if (messageContent.trim()) {
      this.sendMessage(messageContent);
      this.newMessage.set('');
    }
  }

  // 키보드 이벤트
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendCurrentMessage();
    }
  }

  // 재연결
  reconnect(): void {
    this.addSystemMessage('재연결을 시도합니다...');
    this.stompWebSocketService.disconnect();
    setTimeout(() => {
      this.initializeConnection();
    }, 1000);
  }

  // 연결 테스트
  testConnection(): void {
    const clubId = this.chatRoomId();
    const channelInfo = this.currentChannel();
    
    if (this.stompWebSocketService.isConnected()) {
      this.addSystemMessage(`✅ 연결 정상 (Club ID: ${clubId}, Channel: ${channelInfo.name})`);
    } else {
      this.addSystemMessage('❌ 연결 끊어짐');
    }
    
    // 추가 디버깅 정보
    console.log('연결 테스트 정보:', {
      isConnected: this.stompWebSocketService.isConnected(),
      clubId: clubId,
      channelInfo: channelInfo,
      connectionStatus: this.connectionStatus()
    });
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  // 디버깅 메서드
  debugCurrentState(): void {
    console.log('=== MainContainer 현재 상태 ===');
    console.log('현재 채널:', this.currentChannel());
    console.log('채팅방 ID:', this.chatRoomId());
    console.log('연결 상태:', this.connectionStatus());
    console.log('현재 사용자:', {
      email: this.currentUserEmail(),
      username: this.currentUsername()
    });
    console.log('이미지 업로드 중:', this.isUploadingImage());
    
    // SharedService 디버그 호출
    console.log('=== SharedService 디버그 ===');
    this.sharedState.debugChannelSelection();
    
    // WebSocket 서비스 상태
    console.log('=== WebSocket 상태 ===');
    console.log('연결됨:', this.stompWebSocketService.isConnected());
    console.log('현재 클럽 ID:', this.stompWebSocketService.getCurrentClubId());
    console.log('채널 정보:', this.stompWebSocketService.getCurrentChannelInfo());
  }

  // UI 헬퍼 메서드들
  getConnectionStatusText(): string {
    const status = this.connectionStatus();
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

  getInputPlaceholder(): string {
    const status = this.connectionStatus();
    if (status !== 'connected') {
      return '서버 연결 중...';
    }
    
    const clubId = this.chatRoomId();
    if (clubId === -1) {
      return '채널을 선택해주세요...';
    }

    const channelName = this.currentChannel().name;
    return `${channelName}에 메시지를 입력하세요... (Enter: 전송)`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
}