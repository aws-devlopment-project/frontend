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
  channelInfo = computed(() => {
    const info = this.sharedState.channelInfo();
    console.log('📺 Channel Info 계산:', info);
    return info;
  });
  
  currentUserEmail = computed(() => {
    const email = this.sharedState.currentUser()?.id || '';
    console.log('📧 Current User Email 계산:', email);
    return email;
  });
  
  currentUsername = computed(() => {
    const username = this.sharedState.currentUser()?.name || '';
    console.log('👤 Current Username 계산:', username);
    return username;
  });
  
  currentGroup = computed(() => {
    const selectedGroup = this.sharedState.selectedGroup();
    const group = this.sharedState.groupList().find(g => g.name === selectedGroup) || {id: -1, name: ''};
    console.log('📁 Current Group 계산:', { selectedGroup, found: group });
    return group;
  });
  
  currentChannel = computed(() => {
    const selectedChannel = this.sharedState.selectedChannel();
    const channel = this.sharedState.clubList().find(c => c.name === selectedChannel) || {id: -1, name: '', groupId: ''};
    console.log('📺 Current Channel 계산:', { selectedChannel, found: channel });
    return channel;
  });
  
  connectionStatus = computed(() => {
    const status = this.stompWebSocketService.connectionStatus();
    console.log('🔗 Connection Status 계산:', status);
    return status;
  });
  
  // 채팅방 ID 생성 (clubId를 숫자로 변환)
  chatRoomId = computed(() => {
    const id = this.currentChannel().id || -1;
    console.log('🆔 Chat Room ID 계산:', id);
    return id;
  });

  // 저장된 메시지 통계
  messageStats = computed(() => {
    const group = this.currentGroup();
    const channel = this.currentChannel();
    if (!group || !channel) {
      console.log('📊 Message Stats: 그룹 또는 채널 없음');
      return { count: 0, rooms: [] };
    }
    
    const stats = {
      count: this.stompWebSocketService.getChatMessageCount(group.name, channel.name),
      rooms: this.stompWebSocketService.getAllChatRooms()
    };
    console.log('📊 Message Stats 계산:', stats);
    return stats;
  });

  private subscriptions: Subscription[] = [];
  private messageIdCounter = 0;
  private lastJoinedRoomId: number = -1; // 마지막 입장한 방 ID 추적

  constructor(
    public sharedState: SharedStateService,
    private stompWebSocketService: StompWebSocketService
  ) {
    console.log('🏗️ MainContainerComponent 생성자 시작');
    console.log('├── SharedStateService 주입 완료');
    console.log('└── StompWebSocketService 주입 완료');
    
    // 메시지가 업데이트되면 스크롤을 맨 아래로
    effect(() => {
      const messageCount = this.messages().length;
      console.log('📜 Messages Effect 트리거, 메시지 개수:', messageCount);
      if (messageCount > 0) {
        setTimeout(() => {
          console.log('⬇️ 스크롤을 맨 아래로 이동');
          this.scrollToBottom();
        }, 100);
      }
    });

    // 채널 변경 감지 - 개선됨
    effect(() => {
      const clubId = this.chatRoomId();
      const userEmail = this.currentUserEmail();
      const username = this.currentUsername();
      
      console.log('🔄 Channel Change Effect 트리거');
      console.log('┌─ 현재 상태:');
      console.log('├── Club ID:', clubId);
      console.log('├── User Email:', userEmail);
      console.log('├── Username:', username);
      console.log('├── Last Joined Room ID:', this.lastJoinedRoomId);
      console.log('├── Selected Group:', this.sharedState.selectedGroup());
      console.log('├── Selected Channel:', this.sharedState.selectedChannel());
      console.log('└── Current User:', this.sharedState.currentUser());
      
      // 유효한 채널이고 이전과 다른 채널인 경우에만 처리
      if (clubId !== -1 && userEmail && username && clubId !== this.lastJoinedRoomId) {
        console.log('✅ 새 채팅방 입장 조건 만족');
        console.log('┌─ 입장 처리:');
        console.log('├── 새 Club ID:', clubId);
        console.log('├── 이전 Club ID:', this.lastJoinedRoomId);
        console.log('├── 사용자:', username, '(' + userEmail + ')');
        console.log('└── 처리 시작...');
        
        // 이전 방에서 나가기 (있다면)
        if (this.lastJoinedRoomId !== -1) {
          console.log('🚪 이전 채팅방 퇴장:', this.lastJoinedRoomId);
          this.stompWebSocketService.leaveRoom();
        }
        
        // 새 채널 메시지 로드 및 입장
        console.log('🔄 새 채널 메시지 로드');
        this.loadChannelMessages();
        
        console.log('🚪 새 채팅방 입장 시작');
        this.stompWebSocketService.joinRoom(clubId, userEmail, username);
        this.lastJoinedRoomId = clubId;
        
        console.log('✅ 채널 변경 처리 완료');
      } else if (clubId === -1 && this.lastJoinedRoomId !== -1) {
        // 채널 선택 해제된 경우
        console.log('❌ 채널 선택 해제됨');
        console.log('├── 이전 Club ID:', this.lastJoinedRoomId);
        console.log('└── 퇴장 처리 시작...');
        
        this.stompWebSocketService.leaveRoom();
        this.lastJoinedRoomId = -1;
        console.log('✅ 채널 선택 해제 처리 완료');
      } else {
        console.log('ℹ️ 채널 변경 조건 불만족');
        console.log('┌─ 스킵 이유:');
        console.log('├── Club ID 유효:', clubId !== -1);
        console.log('├── User Email 존재:', !!userEmail);
        console.log('├── Username 존재:', !!username);
        console.log('├── 다른 채널:', clubId !== this.lastJoinedRoomId);
        console.log('└── 최종 조건:', clubId !== -1 && userEmail && username && clubId !== this.lastJoinedRoomId);
      }
    });

    // 연결 상태 변경 감지
    effect(() => {
      const status = this.connectionStatus();
      console.log('🔗 Connection Status Effect 트리거:', status);
      
      if (status === 'connected') {
        console.log('✅ STOMP 서버 연결 완료');
        this.addSystemMessage('STOMP 서버에 연결되었습니다.');
        
        // 연결되었고 현재 선택된 채널이 있다면 즉시 입장
        const currentRoomId = this.chatRoomId();
        console.log('🔍 연결 후 자동 입장 확인:');
        console.log('├── Current Room ID:', currentRoomId);
        console.log('├── Last Joined Room ID:', this.lastJoinedRoomId);
        console.log('└── 자동 입장 필요:', currentRoomId !== -1 && currentRoomId !== this.lastJoinedRoomId);
        
        if (currentRoomId !== -1 && currentRoomId !== this.lastJoinedRoomId) {
          const userEmail = this.currentUserEmail();
          const username = this.currentUsername();
          if (userEmail && username) {
            console.log('🚀 연결 후 자동 채팅방 입장');
            console.log('├── Room ID:', currentRoomId);
            console.log('├── User:', username, '(' + userEmail + ')');
            console.log('└── 입장 시작...');
            
            this.stompWebSocketService.joinRoom(currentRoomId, userEmail, username);
            this.lastJoinedRoomId = currentRoomId;
            console.log('✅ 자동 입장 완료');
          } else {
            console.warn('⚠️ 사용자 정보 없어서 자동 입장 불가');
          }
        }
      } else if (status === 'disconnected') {
        console.log('❌ STOMP 서버 연결 끊어짐');
        this.addSystemMessage('STOMP 서버와의 연결이 끊어졌습니다.');
        this.lastJoinedRoomId = -1; // 연결 끊어지면 입장 상태 초기화
        console.log('🔄 입장 상태 초기화 완료');
      } else {
        console.log('🔄 연결 상태 변경:', status);
      }
    });
  }

  ngOnInit(): void {
    console.log('🎬 MainContainerComponent ngOnInit 시작');
    
    console.log('🔌 STOMP 연결 초기화 시작');
    this.initializeStompConnection();
    
    console.log('📡 메시지 구독 설정 시작');
    this.setupMessageSubscriptions();
    
    console.log('✅ MainContainerComponent 초기화 완료');
  }

  ngOnDestroy(): void {
    console.log('🏁 MainContainerComponent ngOnDestroy 시작');
    
    if (this.lastJoinedRoomId !== -1) {
      console.log('🚪 컴포넌트 종료 전 채팅방 퇴장:', this.lastJoinedRoomId);
      this.stompWebSocketService.leaveRoom();
    }
    
    console.log('🔌 STOMP 연결 해제');
    this.stompWebSocketService.disconnect();
    
    console.log('🔕 구독 해제:', this.subscriptions.length + '개');
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    console.log('✅ MainContainerComponent 정리 완료');
  }

  // STOMP 연결 초기화 - 디버깅 로그 강화
  private initializeStompConnection(): void {
    console.log('🔌 STOMP 연결 초기화 시작');
    
    const user = this.sharedState.currentUser();
    console.log('👤 사용자 정보 확인:', user);
    
    if (user && user.id) {
      const serverUrl = this.getServerUrl();
      console.log('🌐 서버 URL:', serverUrl);
      console.log('📧 사용자 이메일:', user.id);
      console.log('👤 사용자 이름:', user.name);
      
      console.log('🚀 STOMP 연결 시작...');
      this.stompWebSocketService.connect(user.id, user.name, serverUrl);
      console.log('✅ STOMP 연결 요청 완료');
    } else {
      console.error('❌ STOMP 연결 초기화 실패: 사용자 데이터 없음');
      console.error('사용자 객체:', user);
    }
  }

  private getServerUrl(): string {
    const url = 'http://localhost:9001'; // 백엔드 예시와 동일한 포트
    console.log('🌐 서버 URL 생성:', url);
    return url;
  }

  // 메시지 구독 설정 - 디버깅 로그 강화
  private setupMessageSubscriptions(): void {
    console.log('📡 메시지 구독 설정 시작');
    
    const messagesSub = this.stompWebSocketService.messages$.subscribe((message: ChatMessageDto) => {
      console.log('📨 WebSocket 서비스에서 메시지 수신:');
      console.log('┌─ 수신된 메시지:');
      console.log('├── Club ID:', message.clubId);
      console.log('├── 발신자:', message.senderUsername, '(' + message.senderEmail + ')');
      console.log('├── 타입:', message.type);
      console.log('├── 내용:', message.message);
      console.log('├── 타임스탬프:', message.timestamp);
      console.log('└── 현재 Club ID:', this.chatRoomId());
      
      this.addDisplayMessage(message);
    });

    const errorsSub = this.stompWebSocketService.errors$.subscribe((error: string) => {
      console.error('🚨 STOMP 오류 수신:', error);
      this.addSystemMessage(`오류: ${error}`);
    });

    this.subscriptions.push(messagesSub, errorsSub);
    console.log('✅ 메시지 구독 설정 완료 (총 ' + this.subscriptions.length + '개 구독)');
  }

  // 채널 메시지 로드 - 디버깅 로그 추가
  private loadChannelMessages(): void {
    const previousCount = this.messages().length;
    console.log('🗑️ 새 채널 입장으로 메시지 초기화');
    console.log('├── 이전 메시지 개수:', previousCount);
    console.log('└── 초기화 후: 0개');
    
    this.messages.set([]);
  }

  // 디스플레이 메시지 추가 - 디버깅 로그 강화
  private addDisplayMessage(message: ChatMessageDto): void {
    console.log('📄 디스플레이 메시지 추가 시작');
    
    // ping 메시지나 빈 메시지 무시
    if (!message.message || message.message === 'ping') {
      console.log('🏓 ping 또는 빈 메시지 무시:', message.message);
      return;
    }

    console.log('✅ 유효한 메시지, 디스플레이 추가 진행');

    const displayMessage: DisplayMessage = {
      id: this.generateMessageId(),
      senderEmail: message.senderEmail,
      senderUsername: message.senderUsername,
      content: message.message,
      timestamp: new Date(message.timestamp || Date.now()),
      type: this.getDisplayType(message.type),
      messageType: message.type,
      isOwn: message.senderEmail === this.currentUserEmail() || 
             message.senderUsername === this.currentUsername()
    };
    
    console.log('📝 생성된 디스플레이 메시지:');
    console.log('┌─ 메시지 정보:');
    console.log('├── ID:', displayMessage.id);
    console.log('├── 발신자:', displayMessage.senderUsername, '(' + displayMessage.senderEmail + ')');
    console.log('├── 내용:', displayMessage.content.substring(0, 50) + '...');
    console.log('├── 타입:', displayMessage.type, '(' + displayMessage.messageType + ')');
    console.log('├── 본인 메시지:', displayMessage.isOwn);
    console.log('├── 타임스탬프:', displayMessage.timestamp.toISOString());
    console.log('└── 현재 메시지 개수:', this.messages().length);
    
    this.messages.update(messages => {
      const newMessages = [...messages, displayMessage];
      console.log('📊 메시지 목록 업데이트:', messages.length, '→', newMessages.length);
      return newMessages;
    });
  }

  // 메시지 타입을 디스플레이 타입으로 변환 - 디버깅 로그 추가
  private getDisplayType(messageType: 'CHAT' | 'JOIN' | 'LEAVE' | 'IMAGE'): 'user' | 'system' {
    const displayType = (messageType === 'JOIN' || messageType === 'LEAVE') ? 'system' : 'user';
    console.log('🔄 메시지 타입 변환:', messageType, '→', displayType);
    return displayType;
  }

  // 시스템 메시지 추가 - 디버깅 로그 추가
  private addSystemMessage(content: string): void {
    console.log('🔧 시스템 메시지 추가:', content);
    
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
    
    this.messages.update(messages => {
      const newMessages = [...messages, systemMessage];
      console.log('📊 시스템 메시지 추가 완료:', newMessages.length + '개');
      return newMessages;
    });
  }

  // 메시지 ID 생성 - 디버깅 로그 추가
  private generateMessageId(): string {
    const id = `msg_${Date.now()}_${++this.messageIdCounter}`;
    console.log('🆔 메시지 ID 생성:', id);
    return id;
  }

  // 메시지 전송 - 디버깅 로그 대폭 강화
  sendMessage(content: string): void {
    console.log('📤 메시지 전송 시작');
    console.log('┌─ 전송 정보:');
    console.log('├── 내용:', content);
    console.log('├── 내용 길이:', content.length);
    console.log('├── Trim된 내용:', content.trim());
    console.log('└── Trim 후 길이:', content.trim().length);

    if (!content.trim()) {
      console.warn('⚠️ 빈 메시지 내용, 전송 취소');
      return;
    }

    const connected = this.stompWebSocketService.isConnected();
    console.log('🔗 STOMP 연결 상태 확인:', connected);
    
    if (!connected) {
      console.warn('⚠️ STOMP 연결되지 않음, 메시지 전송 불가');
      this.addSystemMessage('서버에 연결되지 않았습니다. 연결을 확인해주세요.');
      return;
    }

    const clubId = this.chatRoomId();
    const userEmail = this.currentUserEmail();
    const username = this.currentUsername();

    console.log('📋 전송 전 정보 확인:');
    console.log('├── Club ID:', clubId);
    console.log('├── User Email:', userEmail);
    console.log('├── Username:', username);
    console.log('├── Current Channel:', this.sharedState.selectedChannel());
    console.log('├── Current Group:', this.sharedState.selectedGroup());
    console.log('└── Last Joined Room:', this.lastJoinedRoomId);

    if (clubId === -1) {
      console.warn('⚠️ 채팅방이 선택되지 않음');
      this.addSystemMessage('채팅방이 선택되지 않았습니다.');
      return;
    }

    if (!userEmail || !username) {
      console.warn('⚠️ 사용자 정보 부족');
      console.warn('├── Email:', userEmail);
      console.warn('└── Username:', username);
      this.addSystemMessage('사용자 정보가 없습니다.');
      return;
    }

    console.log('✅ 모든 조건 만족, STOMP 메시지 전송 시작');
    console.log('┌─ 최종 전송 파라미터:');
    console.log('├── Club ID:', clubId);
    console.log('├── User Email:', userEmail);
    console.log('├── Username:', username);
    console.log('├── Content:', content);
    console.log('└── 전송 시각:', new Date().toISOString());
    
    this.stompWebSocketService.sendChatMessage(clubId, userEmail, username, content);
    console.log('🚀 STOMP 메시지 전송 완료');
  }

  sendCurrentMessage(): void {
    const messageContent = this.newMessage();
    console.log('📤 현재 메시지 전송 시작');
    console.log('├── Input 내용:', messageContent);
    console.log('├── Trim 후:', messageContent.trim());
    console.log('└── 전송 가능:', !!messageContent.trim());
    
    if (messageContent.trim()) {
      this.sendMessage(messageContent);
      console.log('🗑️ 입력 필드 초기화');
      this.newMessage.set('');
    } else {
      console.log('ℹ️ 빈 메시지로 전송 스킵');
    }
  }

  // 연결 관리 - 디버깅 로그 강화
  reconnect(): void {
    console.log('🔄 수동 재연결 시작');
    this.addSystemMessage('STOMP 서버에 재연결을 시도합니다...');
    
    console.log('🔄 재연결 상태 초기화');
    this.lastJoinedRoomId = -1;
    
    console.log('🔌 기존 연결 해제');
    this.stompWebSocketService.disconnect();
    
    setTimeout(() => {
      console.log('⏰ 1초 후 재연결 시도');
      this.initializeStompConnection();
    }, 1000);
  }

  // 연결 테스트 - 디버깅 로그 추가
  testConnection(): void {
    console.log('🔍 연결 테스트 시작');
    
    const connected = this.stompWebSocketService.isConnected();
    const clubId = this.chatRoomId();
    const connectionStatus = this.connectionStatus();
    
    console.log('┌─ 연결 테스트 결과:');
    console.log('├── STOMP 연결:', connected);
    console.log('├── 연결 상태:', connectionStatus);
    console.log('├── Club ID:', clubId);
    console.log('├── Last Joined Room:', this.lastJoinedRoomId);
    console.log('└── 사용자:', this.currentUsername(), '(' + this.currentUserEmail() + ')');
    
    if (connected) {
      const roomStatus = clubId !== -1 ? `채팅방 ID: ${clubId}` : '채팅방 미선택';
      const message = `✅ STOMP 연결이 정상입니다. (${roomStatus})`;
      console.log('✅ 연결 테스트 성공');
      this.addSystemMessage(message);
    } else {
      console.log('❌ 연결 테스트 실패');
      this.addSystemMessage('❌ STOMP 연결이 끊어졌습니다. 재연결을 시도해주세요.');
    }
  }

  // 파일 업로드 - 디버깅 로그 추가
  onFileSelect(event: Event): void {
    console.log('📁 파일 선택 이벤트 시작');
    
    const input = event.target as HTMLInputElement;
    console.log('📋 Input 요소 확인:', !!input);
    console.log('📋 Files 존재:', !!input.files);
    console.log('📋 File 개수:', input.files?.length || 0);
    
    if (input.files && input.files[0]) {
      const file = input.files[0];
      console.log('📄 선택된 파일:');
      console.log('├── 이름:', file.name);
      console.log('├── 크기:', file.size, 'bytes');
      console.log('├── 타입:', file.type);
      console.log('├── 마지막 수정:', file.lastModified);
      console.log('└── 업로드 시작...');
      
      this.uploadFile(file);
    } else {
      console.log('ℹ️ 선택된 파일 없음');
    }
  }

  private uploadFile(file: File): void {
    console.log('📤 파일 업로드 시작:', file.name);
    
    const connected = this.stompWebSocketService.isConnected();
    console.log('🔗 연결 상태 확인:', connected);
    
    if (!connected) {
      console.warn('⚠️ 연결 끊어짐, 파일 업로드 불가');
      this.addSystemMessage('연결이 끊어져 파일을 업로드할 수 없습니다');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    console.log('📏 파일 크기 제한 확인:');
    console.log('├── 파일 크기:', file.size, 'bytes');
    console.log('├── 최대 크기:', maxSize, 'bytes');
    console.log('└── 크기 초과:', file.size > maxSize);
    
    if (file.size > maxSize) {
      console.warn('⚠️ 파일 크기 초과');
      this.addSystemMessage('파일 크기는 5MB를 초과할 수 없습니다');
      return;
    }

    console.log('📖 파일 읽기 시작...');
    const reader = new FileReader();
    
    reader.onload = () => {
      console.log('✅ 파일 읽기 완료');
      const base64Data = reader.result as string;
      const clubId = this.chatRoomId();
      const userEmail = this.currentUserEmail();
      const username = this.currentUsername();

      console.log('📋 업로드 정보:');
      console.log('├── Club ID:', clubId);
      console.log('├── User:', username, '(' + userEmail + ')');
      console.log('├── Base64 길이:', base64Data.length);
      console.log('└── 전송 시작...');

      if (clubId !== -1 && userEmail && username) {
        const fileInfo = {
          name: file.name,
          size: file.size,
          type: file.type,
          data: base64Data
        };
        
        console.log('📦 파일 정보 패키징 완료');
        this.stompWebSocketService.sendImageMessage(
          clubId, userEmail, username, JSON.stringify(fileInfo)
        );
        
        const message = `파일 업로드: ${file.name} (${this.formatFileSize(file.size)})`;
        console.log('✅ 파일 업로드 완료:', message);
        this.addSystemMessage(message);
      } else {
        console.error('❌ 업로드 실패: 필수 정보 부족');
        console.error('├── Club ID:', clubId);
        console.error('├── Email:', userEmail);
        console.error('└── Username:', username);
      }
    };
    
    reader.onerror = () => {
      console.error('💥 파일 읽기 오류:', reader.error);
      this.addSystemMessage('파일 읽기 오류가 발생했습니다');
    };
    
    reader.readAsDataURL(file);
  }

  // 키보드 이벤트 - 디버깅 로그 추가
  onKeyDown(event: KeyboardEvent): void {
    console.log('⌨️ 키보드 이벤트:', event.key, 'Shift:', event.shiftKey);
    
    if (event.key === 'Enter' && !event.shiftKey) {
      console.log('📤 Enter 키로 메시지 전송');
      event.preventDefault();
      this.sendCurrentMessage();
    } else if (event.key === 'Enter' && event.shiftKey) {
      console.log('↩️ Shift+Enter로 줄바꿈');
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
    
    const title = titles[channelId.name || ''] || '채널에 오신 것을 환영합니다!';
    console.log('🎉 Welcome Title:', title, 'for channel:', channelId.name);
    return title;
  }

  getWelcomeMessage(): string {
    const channelId = this.currentChannel();
    const baseMessage = this.getChannelDescription(channelId.name);
    const stats = this.messageStats();
    const clubId = this.chatRoomId();
    
    const message = `${baseMessage}\n\n채팅방 ID: ${clubId}\n메모리에 ${stats.count}개의 메시지가 저장되어 있습니다.\nSTOMP를 통해 실시간으로 소통해보세요!`;
    console.log('📝 Welcome Message 생성:', { clubId, messageCount: stats.count });
    return message;
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
    console.log('💬 Input Placeholder 생성, 상태:', status);
    
    if (status !== 'connected') {
      const statusText: Record<ConnectionStatus, string> = {
        'connecting': '서버에 연결 중...',
        'reconnecting': '재연결 중...',
        'disconnected': '서버 연결 끊김',
        'connected': ''
      };
      return statusText[status] || '연결 중...';
    }

    const currentRoomId = this.chatRoomId();
    if (currentRoomId === -1) {
      return '채널을 선택해주세요...';
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
      console.log('⬇️ 스크롤 이동:', element.scrollTop, '→', element.scrollHeight);
      element.scrollTop = element.scrollHeight;
    } else {
      console.warn('⚠️ 메시지 컨테이너 참조 없음');
    }
  }

  // 현재 채널 채팅 이력 삭제
  clearCurrentChannelHistory(): void {
    console.log('🗑️ 현재 채널 이력 삭제 시작');
    
    const group = this.currentGroup();
    const channel = this.currentChannel();
    
    console.log('📋 삭제 대상:');
    console.log('├── Group:', group);
    console.log('└── Channel:', channel);
    
    if (group && channel) {
      this.stompWebSocketService.clearChatHistory(group.name, channel.name);
      const previousCount = this.messages().length;
      this.messages.set([]);
      console.log('✅ 채팅 이력 삭제 완료:', previousCount, '→ 0개');
      this.addSystemMessage('채팅 이력이 삭제되었습니다.');
    } else {
      console.warn('⚠️ 삭제 실패: 그룹 또는 채널 정보 없음');
    }
  }

  // 모든 채팅 이력 삭제
  clearAllHistory(): void {
    console.log('🗑️ 모든 채팅 이력 삭제 시작');
    
    const previousCount = this.messages().length;
    this.stompWebSocketService.clearAllChatHistory();
    this.messages.set([]);
    
    console.log('✅ 모든 채팅 이력 삭제 완료:', previousCount, '→ 0개');
    this.addSystemMessage('모든 채팅 이력이 삭제되었습니다.');
  }

  // 파일 다운로드
  downloadFile(message: DisplayMessage): void {
    console.log('📥 파일 다운로드 시작');
    
    if (!this.isImageMessage(message)) {
      console.warn('⚠️ 이미지 메시지가 아님');
      return;
    }
    
    const fileData = this.getImageData(message);
    if (!fileData) {
      console.warn('⚠️ 파일 데이터 없음');
      return;
    }

    console.log('📁 다운로드 파일:', fileData.name);

    try {
      const link = document.createElement('a');
      link.href = fileData.data;
      link.download = fileData.name || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('✅ 파일 다운로드 완료:', fileData.name);
      this.addSystemMessage(`파일 다운로드: ${fileData.name}`);
    } catch (error) {
      console.error('💥 파일 다운로드 오류:', error);
      this.addSystemMessage('파일 다운로드 중 오류가 발생했습니다.');
    }
  }

  // 이미지 미리보기
  previewImage(message: DisplayMessage): void {
    console.log('🖼️ 이미지 미리보기 시작');
    
    if (!this.isImageMessage(message)) {
      console.warn('⚠️ 이미지 메시지가 아님');
      return;
    }
    
    const fileData = this.getImageData(message);
    if (!fileData || !fileData.type.startsWith('image/')) {
      console.warn('⚠️ 이미지 파일이 아님:', fileData?.type);
      return;
    }

    console.log('🖼️ 이미지 미리보기 창 열기:', fileData.name);

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
      console.log('✅ 미리보기 창 생성 완료');
    } else {
      console.error('❌ 미리보기 창 생성 실패');
    }
  }

  // 개발용 데모 메시지 추가
  addDemoMessage(): void {
    console.log('🎯 데모 메시지 추가');
    
    const demoMessages = [
      '안녕하세요! STOMP 테스트 메시지입니다.',
      'STOMP over WebSocket 연결이 정상적으로 작동하고 있나요?',
      '파일 업로드 기능도 테스트해보세요!',
      '실시간 STOMP 채팅을 즐겨보세요! 🎉'
    ];
    
    const randomMessage = demoMessages[Math.floor(Math.random() * demoMessages.length)];
    console.log('🎲 선택된 데모 메시지:', randomMessage);
    this.sendMessage(randomMessage);
  }

  // 통계 정보 표시
  showStats(): void {
    console.log('📊 통계 정보 표시');
    
    const stats = this.messageStats();
    const clubId = this.chatRoomId();
    const message = `채팅방 ID: ${clubId}, 현재 채널 메시지: ${stats.count}개, 전체 채팅방: ${stats.rooms.length}개`;
    
    console.log('📈 통계:', { clubId, messageCount: stats.count, totalRooms: stats.rooms.length });
    this.addSystemMessage(message);
  }
}