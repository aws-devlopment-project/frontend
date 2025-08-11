// MainContainer.ts - 실제 clubId를 사용하도록 수정
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
      
      // SharedState 상세 디버깅
      console.log('🔍 SharedState 상세 정보:');
      console.log('- 선택된 그룹:', this.sharedState.selectedGroup());
      console.log('- 선택된 채널:', this.sharedState.selectedChannel());
      console.log('- 전체 그룹 목록:', this.sharedState.groupList());
      console.log('- 전체 클럽 목록:', this.sharedState.clubList());
      console.log('- 사용자 가입 목록:', this.sharedState.userJoin());
      
      // 채팅방 입장 조건 체크
      const canJoinChat = channel.id !== -1 && userEmail && username;
      console.log('🚪 채팅방 입장 가능:', canJoinChat);
      
      if (canJoinChat) {
          console.log('✅ 채팅방 입장 조건 충족');
          console.log('📋 입장 정보:', {
              clubId: channel.id,
              channelName: channel.name,
              groupId: channel.groupId,
              userEmail,
              username
          });
          
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
          
          // 상세한 실패 원인 분석
          if (channel.id === -1) {
              console.log('❌ 실패 원인: 유효하지 않은 clubId (-1)');
              console.log('🔍 clubId 문제 분석:');
              
              const selectedGroup = this.sharedState.selectedGroup();
              const selectedChannel = this.sharedState.selectedChannel();
              
              if (!selectedGroup || !selectedChannel) {
                  console.log('- 그룹 또는 채널이 선택되지 않음');
              } else {
                  console.log('- 선택된 그룹/채널:', { selectedGroup, selectedChannel });
                  
                  // 그룹 목록에서 찾기
                  const group = this.sharedState.groupList().find(g => g.name === selectedGroup);
                  console.log('- 그룹 목록에서 찾은 그룹:', group);
                  
                  if (group) {
                      // 클럽 목록에서 찾기
                      const club = this.sharedState.clubList().find(c => 
                          c.name === selectedChannel && c.groupId === group.id
                      );
                      console.log('- 클럽 목록에서 찾은 클럽:', club);
                      
                      if (!club) {
                          console.log('- 추가 검색: 사용자 가입 목록에서 찾기');
                          const userJoin = this.sharedState.userJoin();
                          if (userJoin) {
                              const userGroup = userJoin.joinList.find(g => g.groupname === selectedGroup);
                              if (userGroup) {
                                  const userClub = userGroup.clubList.find(c => c.name === selectedChannel);
                                  console.log('- 사용자 가입 목록에서 찾은 클럽:', userClub);
                              }
                          }
                      }
                  }
              }
          }
          
          if (!userEmail || !username) {
              console.log('❌ 실패 원인: 사용자 정보 누락');
              console.log('- userEmail:', userEmail);
              console.log('- username:', username);
          }
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
    return `#${channelName}에 메시지를 입력하세요... (Enter: 전송)`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  // 디버깅용 버튼 (개발 중에만 사용)
  showDebugInfo(): void {
    this.debugCurrentState();
    
    // 브라우저 알림으로도 표시
    const channel = this.currentChannel();
    alert(`디버그 정보:
채널 이름: ${channel.name}
클럽 ID: ${channel.id}
그룹 ID: ${channel.groupId}
연결 상태: ${this.connectionStatus()}
사용자: ${this.currentUsername()} (${this.currentUserEmail()})

자세한 정보는 콘솔을 확인하세요.`);
  }
}