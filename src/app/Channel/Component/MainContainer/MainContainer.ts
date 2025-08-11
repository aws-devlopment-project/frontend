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

  // Signals
  newMessage = signal('');
  messages = signal<DisplayMessage[]>([]);
  
  // Computed properties
  currentUserEmail = computed(() => this.sharedState.currentUser()?.id || '');
  currentUsername = computed(() => this.sharedState.currentUser()?.name || '');
  currentChannel = computed(() => {
      const channelInfo = this.sharedState.selectedChannelInfo();
      if (!channelInfo) return { id: -1, name: '', groupId: -1 };
      
      // clubList에서 실제 club 정보 찾기
      const club = this.sharedState.clubList().find(c => 
          c.name === channelInfo.id && 
          c.groupId === this.getGroupIdByName(channelInfo.groupId)
      );
      
      return {
          id: club?.id || -1,
          name: channelInfo.name,
          groupId: club?.groupId || -1
      };
  });
  connectionStatus = computed(() => this.stompWebSocketService.connectionStatus());
  chatRoomId = computed(() => this.currentChannel().id);
  
  private getGroupIdByName(groupName: string): number {
      const group = this.sharedState.groupList().find(g => g.name === groupName);
      return group?.id || -1;
  }

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

      // 채널 변경 감지 - 개선된 버전
      effect(() => {
          const channel = this.currentChannel();
          const userEmail = this.currentUserEmail();
          const username = this.currentUsername();
          
          console.log('채널 변경 감지:', { 
              clubId: channel.id, 
              channelName: channel.name,
              groupId: channel.groupId,
              userEmail, 
              username 
          });
          
          if (channel.id !== -1 && userEmail && username) {
              console.log('채팅방 입장 준비:', {
                  clubId: channel.id,
                  channelName: channel.name,
                  userEmail,
                  username
              });
              
              this.messages.set([]); // 메시지 초기화
              this.stompWebSocketService.joinRoom(channel.id, userEmail, username);
          }
      });
  }

  ngOnInit(): void {
    console.log('MainContainer ngOnInit');
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
      this.stompWebSocketService.connect(user.id, user.name, 'http://localhost:9001');
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

  // 디스플레이 메시지 추가
  private addDisplayMessage(message: ChatMessageDto): void {
    if (!message.message || message.message === 'ping') {
      return;
    }

    const displayMessage: DisplayMessage = {
      id: this.generateMessageId(),
      senderEmail: message.senderEmail,
      senderUsername: message.senderUsername,
      content: message.message,
      timestamp: new Date(message.timestamp || Date.now()),
      type: (message.type === 'JOIN' || message.type === 'LEAVE') ? 'system' : 'user',
      messageType: message.type,
      isOwn: message.senderEmail === this.currentUserEmail() || 
             message.senderUsername === this.currentUsername()
    };
    
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
    }
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
    if (this.stompWebSocketService.isConnected()) {
      const clubId = this.chatRoomId();
      this.addSystemMessage(`✅ 연결 정상 (Club ID: ${clubId})`);
    } else {
      this.addSystemMessage('❌ 연결 끊어짐');
    }
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
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
    
    if (this.chatRoomId() === -1) {
      return '채널을 선택해주세요...';
    }

    return '메시지를 입력하세요... (Enter: 전송)';
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
}