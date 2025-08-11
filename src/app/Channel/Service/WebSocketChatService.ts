// WebSocketChatService.ts - 채널 정보 관리 개선
import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Client, IFrame, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { ChatMessageDto } from '../Models/chatMessage';

@Injectable({
  providedIn: 'root'
})
export class StompWebSocketService {
  private stompClient: Client | null = null;
  private currentClubId: number = -1;
  private currentUserEmail: string = '';
  private currentUsername: string = '';
  private currentChannelName: string = '';
  private currentGroupId: string = '';

  // Signals
  connectionStatus = signal<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  
  // Subjects
  private messageSubject = new Subject<ChatMessageDto>();
  private errorSubject = new Subject<string>();

  // Observables
  messages$ = this.messageSubject.asObservable();
  errors$ = this.errorSubject.asObservable();

  constructor() {}
  
  // STOMP 연결 - 개선된 로깅
  connect(userEmail: string, username: string, serverUrl: string = 'http://localhost:9001'): void {
    console.log('🔌 STOMP 연결 시작:', { userEmail, username, serverUrl });
    
    if (this.stompClient?.connected) {
      console.log('✅ 이미 연결됨');
      return;
    }

    this.currentUserEmail = userEmail;
    this.currentUsername = username;
    this.connectionStatus.set('connecting');

    this.stompClient = new Client({
      webSocketFactory: () => new SockJS(`${serverUrl}/ws`),
      
      onConnect: (frame: IFrame) => {
        console.log('✅ STOMP 연결 성공:', frame);
        this.connectionStatus.set('connected');
        
        // 현재 클럽이 있다면 자동 구독
        if (this.currentClubId !== -1) {
          console.log('🔄 기존 클럽 자동 구독:', this.currentClubId);
          this.subscribeToClub(this.currentClubId);
        }
      },

      onStompError: (frame: IFrame) => {
        console.error('❌ STOMP 오류:', frame);
        this.connectionStatus.set('disconnected');
        this.errorSubject.next('STOMP 연결 오류');
      },

      onWebSocketClose: (event: CloseEvent) => {
        console.log('🔌 WebSocket 연결 해제:', event.code, event.reason);
        this.connectionStatus.set('disconnected');
      },

      // 디버그 로깅 추가
      debug: (str: string) => {
        console.log('STOMP Debug:', str);
      }
    });

    this.stompClient.activate();
  }

// 채팅방 입장 - 개선된 정보 관리 및 디버깅
joinRoom(clubId: number, userEmail: string, username: string, channelName?: string, groupId?: string): void {
    console.log('🚪 ===== 채팅방 입장 요청 =====');
    console.log('📋 입력 매개변수:', { 
        clubId, 
        userEmail, 
        username,
        channelName,
        groupId,
        type: typeof clubId
    });
    
    // clubId 유효성 검사
    if (!clubId || clubId === -1 || typeof clubId !== 'number') {
        console.error('❌ 유효하지 않은 clubId:', clubId);
        this.errorSubject.next('유효하지 않은 채널 ID입니다.');
        return;
    }
    
    // 사용자 정보 유효성 검사
    if (!userEmail || !username) {
        console.error('❌ 사용자 정보 누락:', { userEmail, username });
        this.errorSubject.next('사용자 정보가 없습니다.');
        return;
    }
    
    console.log('✅ 입력 검증 통과');
    
    // 기존 채팅방에서 나가기 (다른 채팅방으로 이동하는 경우)
    if (this.currentClubId !== -1 && this.currentClubId !== clubId) {
        console.log('🚪 기존 채팅방 퇴장:', {
            previousClubId: this.currentClubId,
            newClubId: clubId
        });
        this.leaveRoom();
    }
    
    // 새로운 채팅방 정보 설정
    this.currentClubId = clubId;
    this.currentUserEmail = userEmail;
    this.currentUsername = username;
    this.currentChannelName = channelName || '';
    this.currentGroupId = groupId || '';
    
    console.log('📝 채팅방 정보 업데이트 완료:', {
        clubId: this.currentClubId,
        channelName: this.currentChannelName,
        groupId: this.currentGroupId,
        userEmail: this.currentUserEmail,
        username: this.currentUsername
    });
    
    // 연결 상태 확인 및 처리
    const isConnected = this.stompClient?.connected;
    console.log('🔌 STOMP 연결 상태 확인:', {
        connected: isConnected,
        stompClient: !!this.stompClient,
        connectionStatus: this.connectionStatus()
    });
    
    if (isConnected) {
        console.log('✅ 연결된 상태 - 구독 및 입장 메시지 전송');
        this.subscribeToClub(clubId);
        this.sendJoinMessage(clubId, userEmail, username);
    } else {
        console.log('⚠️ 연결되지 않은 상태 - 연결 후 자동 처리될 예정');
    }
    
    console.log('🚪 ===== 채팅방 입장 요청 완료 =====');
}

// 클럽 구독 - 개선된 디버깅
private subscribeToClub(clubId: number): void {
    console.log('📡 ===== 클럽 구독 시작 =====');
    console.log('📋 구독 정보:', {
        clubId,
        type: typeof clubId,
        isValidNumber: !isNaN(clubId) && clubId > 0
    });
    
    if (!this.stompClient?.connected) {
        console.warn('⚠️ STOMP 클라이언트가 연결되지 않음 - 구독 불가');
        return;
    }

    const topic = `/topic/chatroom/${clubId}`;
    console.log('📡 구독 토픽:', topic);

    try {
        this.stompClient.subscribe(topic, (message: IMessage) => {
            console.log('📨 ===== 메시지 수신 =====');
            console.log('📋 메시지 정보:', {
                topic: topic,
                clubId: clubId,
                bodyLength: message.body?.length || 0,
                headers: message.headers
            });
            
            // 메시지 내용 미리보기
            const bodyPreview = message.body?.substring(0, 100) + (message.body?.length > 100 ? '...' : '');
            console.log('📄 메시지 내용 미리보기:', bodyPreview);
            
            try {
                const chatMessage: ChatMessageDto = JSON.parse(message.body);
                
                // 파싱된 메시지 검증
                console.log('✅ 메시지 파싱 성공:', {
                    clubId: chatMessage.clubId,
                    senderEmail: chatMessage.senderEmail,
                    senderUsername: chatMessage.senderUsername,
                    type: chatMessage.type,
                    messageLength: chatMessage.message?.length || 0
                });
                
                // 타임스탬프 추가
                if (!chatMessage.timestamp) {
                    chatMessage.timestamp = Date.now();
                    console.log('⏰ 타임스탬프 추가:', chatMessage.timestamp);
                }
                
                this.messageSubject.next(chatMessage);
                console.log('📨 메시지 전달 완료');
            } catch (error) {
                console.error('❌ 메시지 파싱 오류:', error);
                console.error('📄 원본 메시지:', message.body);
                this.errorSubject.next('메시지 파싱 오류');
            }
            console.log('📨 ===== 메시지 수신 처리 완료 =====');
        });
        
        console.log('✅ 구독 성공:', topic);
    } catch (error) {
        console.error('❌ 구독 실패:', error);
        this.errorSubject.next('채널 구독 실패');
    }
    console.log('📡 ===== 클럽 구독 완료 =====');
}

// JOIN 메시지 전송 - 개선된 디버깅
private sendJoinMessage(clubId: number, userEmail: string, username: string): void {
    console.log('📤 ===== JOIN 메시지 전송 시작 =====');
    
    const channelInfo = this.currentChannelName ? ` (#${this.currentChannelName})` : '';
    const groupInfo = this.currentGroupId ? ` in ${this.currentGroupId}` : '';
    
    const joinMessage = {
        clubId: clubId,
        senderEmail: userEmail,
        senderUsername: username,
        message: `${username} joined chat room ${clubId}${channelInfo}${groupInfo}`,
        type: 'JOIN' as const
    };

    console.log('📋 JOIN 메시지 내용:', {
        clubId: joinMessage.clubId,
        senderEmail: joinMessage.senderEmail,
        senderUsername: joinMessage.senderUsername,
        messageContent: joinMessage.message,
        type: joinMessage.type,
        destination: '/app/chat.addUser'
    });

    this.sendMessage('/app/chat.addUser', joinMessage);
    console.log('📤 ===== JOIN 메시지 전송 완료 =====');
}

  // 채팅 메시지 전송 - 개선된 디버깅
  sendChatMessage(clubId: number, userEmail: string, username: string, messageContent: string): void {
      console.log('📤 ===== CHAT 메시지 전송 시작 =====');
      console.log('📋 전송 요청 정보:', {
          requestedClubId: clubId,
          currentClubId: this.currentClubId,
          userEmail,
          username,
          messageLength: messageContent?.length || 0
      });
      
      if (clubId !== this.currentClubId) {
          console.warn('⚠️ 클럽 ID 불일치:', { 
              requestedClubId: clubId, 
              currentClubId: this.currentClubId 
          });
      }
      
      const message = {
          clubId: clubId,
          senderEmail: userEmail,
          senderUsername: username,
          message: messageContent,
          type: 'CHAT' as const
      };

      console.log('📋 CHAT 메시지 내용:', {
          clubId: message.clubId,
          senderEmail: message.senderEmail,
          senderUsername: message.senderUsername,
          messagePreview: messageContent.substring(0, 50) + (messageContent.length > 50 ? '...' : ''),
          type: message.type,
          channelName: this.currentChannelName,
          groupId: this.currentGroupId,
          destination: '/app/chat.sendMessage'
      });
      
      this.sendMessage('/app/chat.sendMessage', message);
      console.log('📤 ===== CHAT 메시지 전송 완료 =====');
  }

  // STOMP 메시지 전송 - 개선된 에러 처리 및 디버깅
  private sendMessage(destination: string, message: any): void {
      console.log('📤 ===== STOMP 메시지 전송 =====');
      console.log('📋 전송 정보:', {
          destination,
          messageType: message.type,
          clubId: message.clubId,
          connected: this.stompClient?.connected || false
      });
      
      if (!this.stompClient?.connected) {
          console.error('❌ STOMP 클라이언트가 연결되지 않음');
          console.log('🔌 연결 상태 디버그:', {
              stompClient: !!this.stompClient,
              connected: this.stompClient?.connected,
              connectionStatus: this.connectionStatus()
          });
          this.errorSubject.next('서버 연결이 끊어졌습니다.');
          return;
      }

      try {
          const messageJson = JSON.stringify(message);
          console.log('📋 전송할 JSON:', {
              size: messageJson.length,
              preview: messageJson.substring(0, 200) + (messageJson.length > 200 ? '...' : '')
          });
          
          this.stompClient.publish({
              destination: destination,
              body: messageJson
          });
          
          console.log('✅ 메시지 전송 성공');
      } catch (error) {
          console.error('❌ 메시지 전송 실패:', error);
          console.error('📋 실패한 메시지:', message);
          this.errorSubject.next('메시지 전송 실패');
      }
      console.log('📤 ===== STOMP 메시지 전송 완료 =====');
  }

  // 채팅방 퇴장 - 개선된 로직
  leaveRoom(): void {
    if (this.currentClubId !== -1 && this.stompClient?.connected) {
      const channelInfo = this.currentChannelName ? ` (#${this.currentChannelName})` : '';
      const leaveMessage = {
        clubId: this.currentClubId,
        senderEmail: this.currentUserEmail,
        senderUsername: this.currentUsername,
        message: `${this.currentUsername} left chat room ${this.currentClubId}${channelInfo}`,
        type: 'LEAVE' as const
      };
      
      console.log('🚪 LEAVE 메시지 전송:', leaveMessage);
      this.sendMessage('/app/chat.sendMessage', leaveMessage);
    }
    
    // 채팅방 정보 초기화
    console.log('🔄 채팅방 정보 초기화');
    this.currentClubId = -1;
    this.currentChannelName = '';
    this.currentGroupId = '';
  }

  // 연결 해제 - 개선된 정리
  disconnect(): void {
    console.log('🔌 WebSocket 연결 해제 시작');
    
    this.leaveRoom();
    
    if (this.stompClient) {
      try {
        this.stompClient.deactivate();
        console.log('✅ STOMP 클라이언트 비활성화 완료');
      } catch (error) {
        console.error('❌ STOMP 클라이언트 비활성화 실패:', error);
      }
      this.stompClient = null;
    }
    
    this.connectionStatus.set('disconnected');
    console.log('🔌 WebSocket 연결 해제 완료');
  }

  // 연결 상태 확인 - 개선된 체크
  isConnected(): boolean {
    const connected = this.connectionStatus() === 'connected' && !!this.stompClient?.connected;
    
    if (!connected) {
      console.log('❌ 연결 상태 확인:', {
        statusSignal: this.connectionStatus(),
        stompConnected: !!this.stompClient?.connected,
        stompClient: !!this.stompClient
      });
    }
    
    return connected;
  }

  // 현재 클럽 ID 조회
  getCurrentClubId(): number {
    return this.currentClubId;
  }

  getCurrentChannelInfo(): { 
      clubId: number, 
      channelName: string, 
      groupId: string,
      userEmail: string,
      username: string
  } {
      const info = {
          clubId: this.currentClubId,
          channelName: this.currentChannelName,
          groupId: this.currentGroupId,
          userEmail: this.currentUserEmail,
          username: this.currentUsername
      };
      
      console.log('ℹ️ 현재 채널 정보 조회:', info);
      return info;
  }

  // 디버깅용 메서드
  debugConnectionState(): void {
    console.log('=== WebSocket 연결 상태 디버그 ===');
    console.log('연결 상태 신호:', this.connectionStatus());
    console.log('STOMP 클라이언트 존재:', !!this.stompClient);
    console.log('STOMP 클라이언트 연결됨:', !!this.stompClient?.connected);
    console.log('현재 클럽 ID:', this.currentClubId);
    console.log('현재 채널 이름:', this.currentChannelName);
    console.log('현재 그룹 ID:', this.currentGroupId);
    console.log('현재 사용자:', {
      email: this.currentUserEmail,
      username: this.currentUsername
    });
    console.log('실제 연결 상태:', this.isConnected());
  }

  // 연결 강제 재시도
  forceReconnect(): void {
    console.log('🔄 강제 재연결 시도');
    this.connectionStatus.set('reconnecting');
    
    this.disconnect();
    
    setTimeout(() => {
      if (this.currentUserEmail && this.currentUsername) {
        this.connect(this.currentUserEmail, this.currentUsername);
      } else {
        console.error('❌ 재연결 실패: 사용자 정보 없음');
        this.connectionStatus.set('disconnected');
      }
    }, 1000);
  }
}