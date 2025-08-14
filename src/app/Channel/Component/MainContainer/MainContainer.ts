// MainContainer.ts - 중복 구독 방지 개선 버전
import { Component, signal, computed, effect, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { Subscription } from "rxjs";
import { SharedStateService } from "../../../Core/Service/SharedService";
import { StompWebSocketService } from "../../Service/WebSocketChatService";
import { ChatMessageDto } from "../../Models/chatMessage";
import { environment } from "../../../../environments/environment.prod";

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

   // 🔥 전송한 메시지 추적을 위한 캐시
  private sentMessages = new Map<string, number>();
  private readonly SENT_MESSAGE_CACHE_DURATION = 10000; // 10초

  // Signals
  newMessage = signal('');
  messages = signal<DisplayMessage[]>([]);
  
  // 🔥 중복 구독 방지를 위한 상태 추가
  private isJoiningRoom = signal(false);
  private lastJoinedChannel = signal<{clubId: number, groupId: number} | null>(null);
  
  // Computed properties
  currentUserEmail = computed(() => this.sharedState.currentUser()?.id || '');
  currentUsername = computed(() => this.sharedState.currentUser()?.name || '');
  
  currentChannel = computed(() => {
    const channelInfo = this.sharedState.currentChannelWithId();
    console.log('Current channel computed:', channelInfo);
    return channelInfo;
  });
  
  connectionStatus = computed(() => this.stompWebSocketService.connectionStatus());
  
  chatRoomId = computed(() => {
    const channel = this.currentChannel();
    console.log('Chat room ID computed:', {
      channelInfo: channel,
      clubId: channel.id
    });
    return channel.id;
  });

  // 🔥 채널 변경 감지를 위한 computed
  private channelKey = computed(() => {
    const channel = this.currentChannel();
    const userEmail = this.currentUserEmail();
    const username = this.currentUsername();
    
    // 모든 필수 조건이 충족된 경우에만 유효한 키 반환
    if (channel.id !== -1 && userEmail && username) {
      return `${channel.id}-${channel.groupId}-${userEmail}`;
    }
    return null;
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

    // 🔥 개선된 채널 변경 감지 - 중복 구독 방지
    effect(() => {
      const channelKey = this.channelKey();
      const connectionStatus = this.connectionStatus();
      const isJoining = this.isJoiningRoom();
      
      console.log('🔄 ===== 채널 변경 감지 Effect =====');
      console.log('📋 Effect 입력:', {
        channelKey,
        connectionStatus,
        isJoining,
        currentChannel: this.currentChannel(),
        lastJoined: this.lastJoinedChannel()
      });
      
      // 필수 조건 확인
      if (!channelKey) {
        console.log('❌ 채널 키가 없음 - 조건 미충족');
        return;
      }
      
      // 이미 같은 채널에 참여 중인지 확인
      const currentChannel = this.currentChannel();
      const lastJoined = this.lastJoinedChannel();
      
      const isSameChannel = lastJoined && 
        lastJoined.clubId === currentChannel.id && 
        lastJoined.groupId === currentChannel.groupId;
      
      if (isSameChannel && !isJoining) {
        console.log('✅ 이미 같은 채널에 참여 중 - 스킵');
        return;
      }
      
      // 이미 참여 프로세스가 진행 중인지 확인
      if (isJoining) {
        console.log('⏳ 이미 채팅방 참여 프로세스 진행 중 - 스킵');
        return;
      }
      
      // 연결 상태 확인
      if (connectionStatus !== 'connected') {
        console.log('📡 WebSocket 연결되지 않음 - 연결 후 자동 처리 예정');
        return;
      }
      
      // 채팅방 참여 실행
      this.joinChatRoom(currentChannel);
      
      console.log('🔄 ===== 채널 변경 감지 Effect 완료 =====');
    });

    // 연결 상태 변경 감지 - 연결 복구 시 자동 재참여
    effect(() => {
      const status = this.connectionStatus();
      const channel = this.currentChannel();
      const isJoining = this.isJoiningRoom();
      
      console.log('📡 연결 상태 변경:', status);
      
      if (status === 'connected') {
        this.addSystemMessage('서버에 연결되었습니다.');
        
        // 연결 복구 시 채널이 선택되어 있고 참여 중이 아니라면 자동 재참여
        if (channel.id !== -1 && !isJoining) {
          const lastJoined = this.lastJoinedChannel();
          const needsRejoin = !lastJoined || 
            lastJoined.clubId !== channel.id || 
            lastJoined.groupId !== channel.groupId;
            
          if (needsRejoin) {
            console.log('🔄 연결 복구 - 채팅방 자동 재참여');
            setTimeout(() => this.joinChatRoom(channel), 1000);
          }
        }
      } else if (status === 'disconnected') {
        this.addSystemMessage('서버와의 연결이 끊어졌습니다.');
        // 연결이 끊어지면 마지막 참여 정보 초기화
        this.lastJoinedChannel.set(null);
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

  // 🔥 전송 캐시 정리 (컴포넌트 종료 시)
  ngOnDestroy(): void {
    console.log('MainContainer ngOnDestroy');
    this.stompWebSocketService.disconnect();
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    // 전송 캐시 정리
    this.sentMessages.clear();
  }

  // 🔥 개선된 채팅방 참여 로직
  private async joinChatRoom(channel: {id: number, name: string, groupId: number}): Promise<void> {
    if (this.isJoiningRoom()) {
      console.log('⚠️ 이미 채팅방 참여 프로세스 진행 중');
      return;
    }
    
    console.log('🚪 ===== 채팅방 참여 시작 =====');
    console.log('📋 참여 정보:', {
      clubId: channel.id,
      channelName: channel.name,
      groupId: channel.groupId,
      userEmail: this.currentUserEmail(),
      username: this.currentUsername()
    });
    
    // 참여 프로세스 시작 표시
    this.isJoiningRoom.set(true);
    
    try {
      // 기존 참여 정보와 비교
      const lastJoined = this.lastJoinedChannel();
      if (lastJoined && lastJoined.clubId === channel.id && lastJoined.groupId === channel.groupId) {
        console.log('✅ 이미 같은 채널에 참여 중 - 스킵');
        return;
      }
      
      // 메시지 초기화
      this.messages.set([]);
      
      // WebSocket 서비스에 채팅방 참여 요청
      this.stompWebSocketService.joinRoom(
        channel.id,
        this.currentUserEmail(),
        this.currentUsername(),
        channel.name,
        String(channel.groupId)
      );
      
      // 참여 완료 정보 저장
      this.lastJoinedChannel.set({
        clubId: channel.id,
        groupId: channel.groupId
      });
      
      console.log('✅ 채팅방 참여 완료');
      
    } catch (error) {
      console.error('❌ 채팅방 참여 실패:', error);
      this.addSystemMessage('채팅방 참여에 실패했습니다.');
    } finally {
      // 참여 프로세스 완료 표시
      this.isJoiningRoom.set(false);
    }
    
    console.log('🚪 ===== 채팅방 참여 완료 =====');
  }

  // STOMP 연결 초기화
  private initializeConnection(): void {
    const user = this.sharedState.currentUser();
    const serverUrl = "https://server.teamnameless.click";
    if (user && user.id) {
      console.log('STOMP 연결 초기화:', { userEmail: user.id, username: user.name });
      this.stompWebSocketService.connect(user.id, user.name, serverUrl);
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

  // 🔥 개선된 메시지 전송 - 즉시 UI에 추가
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
      console.log('📤 메시지 전송:', { clubId, userEmail, username, content });
      
      // 🔥 1. 먼저 UI에 즉시 표시 (낙관적 업데이트)
      const optimisticMessage: DisplayMessage = {
        id: this.generateMessageId(),
        senderEmail: userEmail,
        senderUsername: username,
        content: content,
        timestamp: new Date(),
        type: 'user',
        messageType: 'CHAT',
        isOwn: true
      };
      
      // 메시지를 전송 캐시에 추가 (서버 응답과 중복 방지용)
      const messageKey = this.generateSentMessageKey(content, userEmail);
      this.sentMessages.set(messageKey, Date.now());
      
      // UI에 즉시 추가
      this.messages.update(messages => [...messages, optimisticMessage]);
      
      // 🔥 2. 서버로 전송
      this.stompWebSocketService.sendChatMessage(clubId, userEmail, username, content, optimisticMessage.messageType);
      
      // 🔥 3. 캐시 정리 스케줄링
      setTimeout(() => {
        this.sentMessages.delete(messageKey);
      }, this.SENT_MESSAGE_CACHE_DURATION);
      
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

  private resizeImage(file: File, maxWidth: number, maxHeight: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = e => {
        img.src = e.target?.result as string;
      };

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // 비율 유지하며 크기 조정
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        // JPEG 변환 (품질 0.8)
        const resizedBase64 = canvas.toDataURL("image/jpeg", 0.8);
        resolve(resizedBase64);
      };

      img.onerror = err => reject(err);
      reader.readAsDataURL(file);
    });
  }

  async sendImage(file: File) {
    if (!this.stompWebSocketService.isConnected()) {
      this.addSystemMessage('서버에 연결되지 않았습니다.');
      return;
    }

    const clubId = this.chatRoomId();
    const userEmail = this.currentUserEmail();
    const username = this.currentUsername();

    if (clubId !== -1 && userEmail && username) {
      try {
        // 1. 리사이즈 처리
        const resizedBase64 = await this.resizeImage(file, 800, 800);

        // 2. UI 낙관적 업데이트
        const optimisticMessage: DisplayMessage = {
          id: this.generateMessageId(),
          senderEmail: userEmail,
          senderUsername: username,
          content: resizedBase64, // 접두사 포함
          timestamp: new Date(),
          type: 'user',
          messageType: 'IMAGE',
          isOwn: true
        };

        const messageKey = this.generateSentMessageKey(resizedBase64, userEmail);
        this.sentMessages.set(messageKey, Date.now());
        this.messages.update(messages => [...messages, optimisticMessage]);

        // 3. 서버로 전송
        this.stompWebSocketService.sendChatMessage(
          clubId,
          userEmail,
          username,
          resizedBase64,
          optimisticMessage.messageType
        );

        // 4. 캐시 삭제 예약
        setTimeout(() => {
          this.sentMessages.delete(messageKey);
        }, this.SENT_MESSAGE_CACHE_DURATION);

      } catch (err) {
        console.error("이미지 리사이즈 실패", err);
        this.addSystemMessage("이미지 전송 중 오류가 발생했습니다.");
      }
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

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      console.log('📤 이미지 선택:', input.files[0]);
      this.sendImage(input.files[0]);
    }
  }

  // 🔥 메시지 전송 실패 처리 (선택사항)
  private handleMessageSendFailure(content: string): void {
    // 전송 실패 시 낙관적으로 추가된 메시지를 제거하거나 표시 변경
    console.warn('메시지 전송 실패:', content);
    
    // 실패한 메시지를 시각적으로 표시하거나 재시도 옵션 제공
    const lastMessage = this.messages()[this.messages().length - 1];
    if (lastMessage && lastMessage.content === content && lastMessage.isOwn) {
      // 메시지에 실패 표시 추가 등의 처리
      console.log('마지막 메시지가 전송 실패한 메시지임');
    }
  }

  // 🔥 개선된 디스플레이 메시지 추가 - 중복 방지
  private addDisplayMessage(message: ChatMessageDto): void {
    if (!message.message || message.message === 'ping') {
      return;
    }

    // 🔥 자신이 보낸 메시지인지 확인
    const isOwnMessage = message.senderEmail === this.currentUserEmail() || 
                        message.senderUsername === this.currentUsername();
    
    // 🔥 자신이 보낸 메시지이고 CHAT 타입인 경우 중복 확인
    if (isOwnMessage && message.type === 'CHAT') {
      const messageKey = this.generateSentMessageKey(message.message, message.senderEmail);
      
      if (this.sentMessages.has(messageKey)) {
        console.log('🔄 자신이 보낸 메시지 서버 응답 - UI 업데이트 스킵:', {
          message: message.message.substring(0, 20) + '...',
          key: messageKey
        });
        return; // 이미 UI에 표시된 자신의 메시지는 스킵
      }
    }

    const displayMessage: DisplayMessage = {
      id: this.generateMessageId(),
      senderEmail: message.senderEmail,
      senderUsername: message.senderUsername,
      content: message.message,
      timestamp: new Date(message.timestamp || Date.now()),
      type: (message.type === 'JOIN' || message.type === 'LEAVE') ? 'system' : 'user',
      messageType: message.type,
      isOwn: isOwnMessage
    };
    
    console.log('📨 메시지 추가:', {
      isOwn: isOwnMessage,
      type: message.type,
      content: message.message.substring(0, 20) + '...'
    });
    
    this.messages.update(messages => [...messages, displayMessage]);
  }

  // 🔥 전송 메시지 키 생성
  private generateSentMessageKey(message: string, senderEmail: string): string {
    return `${senderEmail}:${message.trim()}`;
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

  // 🔥 개선된 재연결 - 중복 방지
  reconnect(): void {
    if (this.isJoiningRoom()) {
      console.log('⚠️ 채팅방 참여 중이므로 재연결 요청 무시');
      return;
    }
    
    this.addSystemMessage('재연결을 시도합니다...');
    this.lastJoinedChannel.set(null); // 재연결 시 참여 정보 초기화
    this.stompWebSocketService.disconnect();
    
    setTimeout(() => {
      this.initializeConnection();
    }, 1000);
  }

  // 연결 테스트
  testConnection(): void {
    const clubId = this.chatRoomId();
    const channelInfo = this.currentChannel();
    const isJoining = this.isJoiningRoom();
    const lastJoined = this.lastJoinedChannel();
    
    if (this.stompWebSocketService.isConnected()) {
      this.addSystemMessage(`✅ 연결 정상 (Club ID: ${clubId}, Channel: ${channelInfo.name})`);
    } else {
      this.addSystemMessage('❌ 연결 끊김');
    }
    
    // 추가 디버깅 정보
    console.log('연결 테스트 정보:', {
      isConnected: this.stompWebSocketService.isConnected(),
      clubId: clubId,
      channelInfo: channelInfo,
      connectionStatus: this.connectionStatus(),
      isJoining: isJoining,
      lastJoined: lastJoined
    });
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  // 🔥 강화된 디버깅 메서드
  debugCurrentState(): void {
    console.log('=== MainContainer 현재 상태 ===');
    console.log('현재 채널:', this.currentChannel());
    console.log('채팅방 ID:', this.chatRoomId());
    console.log('연결 상태:', this.connectionStatus());
    console.log('참여 진행 중:', this.isJoiningRoom());
    console.log('마지막 참여:', this.lastJoinedChannel());
    console.log('채널 키:', this.channelKey());
    console.log('현재 사용자:', {
      email: this.currentUserEmail(),
      username: this.currentUsername()
    });
    
    // SharedService 디버그 호출
    console.log('=== SharedService 디버그 ===');
    this.sharedState.debugChannelSelection();
    
    // WebSocket 서비스 상태
    console.log('=== WebSocket 상태 ===');
    console.log('연결됨:', this.stompWebSocketService.isConnected());
    console.log('현재 클럽 ID:', this.stompWebSocketService.getCurrentClubId());
    console.log('채널 정보:', this.stompWebSocketService.getCurrentChannelInfo());
  }

  // UI 헬퍼 메서드들 (기존과 동일)
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
    return `#${channelName}에 메시지를 입력하세요... (Enter: 전송)`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  // 🔥 개선된 강제 재참여 메서드
  forceRejoinChannel(): void {
    const channel = this.currentChannel();
    
    if (channel.id === -1) {
      this.addSystemMessage('참여할 채널이 선택되지 않았습니다.');
      return;
    }
    
    if (this.isJoiningRoom()) {
      this.addSystemMessage('이미 채팅방 참여가 진행 중입니다.');
      return;
    }
    
    console.log('🔄 강제 채팅방 재참여');
    this.lastJoinedChannel.set(null); // 기존 참여 정보 초기화
    this.joinChatRoom(channel);
  }

  // 디버깅용 버튼 (개발 중에만 사용)
  showDebugInfo(): void {
    this.debugCurrentState();
    
    // 브라우저 알림으로도 표시
    const channel = this.currentChannel();
    const isJoining = this.isJoiningRoom();
    const lastJoined = this.lastJoinedChannel();
    
    alert(`디버그 정보:
채널 이름: ${channel.name}
클럽 ID: ${channel.id}
그룹 ID: ${channel.groupId}
연결 상태: ${this.connectionStatus()}
참여 진행 중: ${isJoining}
마지막 참여: ${JSON.stringify(lastJoined)}
사용자: ${this.currentUsername()} (${this.currentUserEmail()})

자세한 정보는 콘솔을 확인하세요.`);
  }
}