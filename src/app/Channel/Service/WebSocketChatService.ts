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
  private currentChannelName: string = '';
  private currentGroupName: string = '';
  private currentUserEmail: string = '';
  private currentUsername: string = '';

  // Signals
  connectionStatus = signal<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  
  // Subjects
  private messageSubject = new Subject<ChatMessageDto>();
  private errorSubject = new Subject<string>();

  // Observables
  messages$ = this.messageSubject.asObservable();
  errors$ = this.errorSubject.asObservable();

  // STOMP 연결 - 백엔드 예시와 동일
  connect(userEmail: string, username: string, serverUrl: string = 'http://localhost:9001'): void {
    console.log('STOMP 연결 시작:', { userEmail, username, serverUrl });
    
    if (this.stompClient?.connected) {
      console.log('이미 연결됨');
      return;
    }

    this.currentUserEmail = userEmail;
    this.currentUsername = username;
    this.connectionStatus.set('connecting');
    this.stompClient = new Client({
      webSocketFactory: () => new SockJS(`${serverUrl}/ws`),
      
      onConnect: (frame: IFrame) => {
        console.log('STOMP 연결 성공:', frame);
        this.connectionStatus.set('connected');
        
        // 현재 클럽이 있다면 자동 구독
        if (this.currentClubId !== -1) {
          this.subscribeToClub(this.currentClubId);
        }
      },

      onStompError: (frame: IFrame) => {
        console.error('STOMP 오류:', frame);
        this.connectionStatus.set('disconnected');
        this.errorSubject.next('STOMP 연결 오류');
      },

      onWebSocketClose: (event: CloseEvent) => {
        console.log('WebSocket 연결 해제:', event.code, event.reason);
        this.connectionStatus.set('disconnected');
      }
    });

    this.stompClient.activate();
  }

  // 클럽 구독
  private subscribeToClub(clubId: number): void {
    if (!this.stompClient?.connected) {
      console.warn('STOMP 클라이언트가 연결되지 않음');
      return;
    }

    const topic = `/topic/chatroom/${clubId}`;
    console.log('구독 시작:', topic);

    this.stompClient.subscribe(topic, (message: IMessage) => {
      console.log('메시지 수신:', message.body);
      try {
        const chatMessage: ChatMessageDto = JSON.parse(message.body);
        if (!chatMessage.timestamp) {
          chatMessage.timestamp = Date.now();
        }
        this.messageSubject.next(chatMessage);
      } catch (error) {
        console.error('메시지 파싱 오류:', error);
      }
    });
  }

  // 채팅방 입장 - 채널 정보 포함
  joinRoom(clubId: number, userEmail: string, username: string, channelName?: string, groupName?: string): void {
      console.log('채팅방 입장:', { 
          clubId, 
          userEmail, 
          username,
          channelName,
          groupName
      });
      
      this.currentClubId = clubId;
      this.currentUserEmail = userEmail;
      this.currentUsername = username;
      this.currentChannelName = channelName || '';
      this.currentGroupName = groupName || '';
      
      if (this.stompClient?.connected) {
          this.subscribeToClub(clubId);
          this.sendJoinMessage(clubId, userEmail, username);
      }
  }

  // JOIN 메시지에 채널 정보 포함
  private sendJoinMessage(clubId: number, userEmail: string, username: string): void {
      const channelInfo = this.currentChannelName ? ` (#${this.currentChannelName})` : '';
      const joinMessage = {
          clubId: clubId,
          senderEmail: userEmail,
          senderUsername: username,
          message: `${username} joined chat room ${clubId}${channelInfo}`,
          type: 'JOIN' as const
      };

      console.log('JOIN 메시지 전송:', joinMessage);
      this.sendMessage('/app/chat.addUser', joinMessage);
  }

  // 채팅 메시지 전송 - 백엔드 예시와 동일
  sendChatMessage(clubId: number, userEmail: string, username: string, messageContent: string): void {
    const message = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: messageContent,
      type: 'CHAT' as const
    };

    console.log('CHAT 메시지 전송:', message);
    this.sendMessage('/app/chat.sendMessage', message);
  }

  // STOMP 메시지 전송
  private sendMessage(destination: string, message: any): void {
    if (!this.stompClient?.connected) {
      console.error('STOMP 클라이언트가 연결되지 않음');
      return;
    }

    console.log(`메시지 전송 -> ${destination}:`, message);
    this.stompClient.publish({
      destination: destination,
      body: JSON.stringify(message)
    });
  }

  // 채팅방 퇴장
  leaveRoom(): void {
    if (this.currentClubId !== -1 && this.stompClient?.connected) {
      const leaveMessage = {
        clubId: this.currentClubId,
        senderEmail: this.currentUserEmail,
        senderUsername: this.currentUsername,
        message: `${this.currentUsername} left the chat`,
        type: 'LEAVE' as const
      };
      this.sendMessage('/app/chat.sendMessage', leaveMessage);
    }
    this.currentClubId = -1;
  }

  // 연결 해제
  disconnect(): void {
    this.leaveRoom();
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.stompClient = null;
    }
    this.connectionStatus.set('disconnected');
  }

  // 연결 상태 확인
  isConnected(): boolean {
    return this.connectionStatus() === 'connected' && !!this.stompClient?.connected;
  }

  // 현재 클럽 ID 조회
  getCurrentClubId(): number {
    return this.currentClubId;
  }

  // 현재 채널 정보 조회
  getCurrentChannelInfo(): { clubId: number, channelName: string, groupName: string } {
      return {
          clubId: this.currentClubId,
          channelName: this.currentChannelName,
          groupName: this.currentGroupName
      };
  }
}