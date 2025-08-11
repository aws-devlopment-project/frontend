import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Client, IFrame, IMessage, IPublishParams } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { ChatHistory, ChatMessageDto } from '../Models/chatMessage';

@Injectable({
  providedIn: 'root'
})
export class StompWebSocketService {
  private stompClient: Client | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private currentClubId: number = -1;
  private currentUserEmail: string = '';
  private currentUsername: string = '';
  
  // 메모리 기반 채팅 이력 저장
  private chatHistories = new Map<string, ChatHistory>();

  // Signals
  connectionStatus = signal<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  
  // Subjects
  private messageSubject = new Subject<ChatMessageDto>();
  private errorSubject = new Subject<string>();

  // Observables
  messages$ = this.messageSubject.asObservable();
  errors$ = this.errorSubject.asObservable();

  constructor() {
    console.log('StompWebSocketService initialized');
  }

  // STOMP 연결 - 백엔드 호환성 개선
  connect(userEmail: string, username: string, serverUrl: string = 'http://localhost:9001'): void {
    if (this.stompClient?.connected) {
      console.log('Already connected to STOMP server');
      return;
    }

    this.currentUserEmail = userEmail;
    this.currentUsername = username;
    this.connectionStatus.set('connecting');

    try {
      this.stompClient = new Client({
        // SockJS URL 수정 - 백엔드 설정과 일치
        webSocketFactory: () => {
          const socket = new SockJS(`${serverUrl}/ws`);
          return socket as any;
        },
        
        // 연결 헤더 - 백엔드에서 필요한 경우
        connectHeaders: {
          'userEmail': userEmail,
          'username': username
        },

        // 디버그 출력 개선
        debug: (str: string) => {
          console.log('STOMP Debug:', str);
        },

        // 재연결 및 하트비트 설정
        reconnectDelay: this.reconnectInterval,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,

        // 연결 성공 콜백
        onConnect: (frame: IFrame) => {
          console.log('STOMP Connected Successfully:', frame);
          this.connectionStatus.set('connected');
          this.reconnectAttempts = 0;
          
          // 연결 후 즉시 현재 클럽 구독
          if (this.currentClubId !== -1) {
            this.subscribeToClub(this.currentClubId);
          }
        },

        // STOMP 오류 콜백
        onStompError: (frame: IFrame) => {
          console.error('STOMP Error Frame:', frame);
          this.connectionStatus.set('disconnected');
          const errorMessage = frame.headers['message'] || frame.body || '알 수 없는 STOMP 오류';
          this.errorSubject.next(`STOMP 오류: ${errorMessage}`);
          this.attemptReconnect();
        },

        // 웹소켓 연결 해제 콜백
        onWebSocketClose: (event: CloseEvent) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.connectionStatus.set('disconnected');
          
          // 정상 종료가 아닌 경우에만 재연결
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        },

        // 웹소켓 오류 콜백
        onWebSocketError: (event: Event) => {
          console.error('WebSocket Error:', event);
          this.errorSubject.next('WebSocket 연결 오류');
        }
      });

      // 연결 활성화
      this.stompClient.activate();
      console.log('STOMP client activation initiated');
      
    } catch (error) {
      console.error('Failed to create STOMP connection:', error);
      this.connectionStatus.set('disconnected');
      this.errorSubject.next(`STOMP 연결 생성 실패: ${error}`);
    }
  }

  // 클럽 구독 분리
  private subscribeToClub(clubId: number): void {
    if (!this.stompClient?.connected) {
      console.warn('Cannot subscribe: STOMP client not connected');
      return;
    }

    const topic = `/topic/chatroom/${clubId}`;
    console.log(`Subscribing to topic: ${topic}`);

    try {
      const subscription = this.stompClient.subscribe(topic, (message: IMessage) => {
        console.log('Raw message received:', message);
        try {
          const chatMessage: ChatMessageDto = JSON.parse(message.body);
          console.log('Parsed message:', chatMessage);
          
          // 타임스탬프 보정
          if (!chatMessage.timestamp) {
            chatMessage.timestamp = Date.now();
          }
          
          this.handleMessage(chatMessage);
        } catch (parseError) {
          console.error('Message parsing error:', parseError, 'Raw body:', message.body);
          this.errorSubject.next('메시지 파싱 오류');
        }
      });

      console.log('Successfully subscribed to', topic);
    } catch (subscribeError) {
      console.error('Subscription error:', subscribeError);
      this.errorSubject.next('구독 실패');
    }
  }

  // 채팅방 입장 - 백엔드 호환성 개선
  joinRoom(clubId: number, userEmail: string, username: string): void {
    console.log(`Joining room: clubId=${clubId}, email=${userEmail}, username=${username}`);
    
    this.currentClubId = clubId;
    this.currentUserEmail = userEmail;
    this.currentUsername = username;
    
    // 메모리에서 채팅 이력 로드
    this.loadChatHistoryFromMemory(clubId);
    
    // 연결된 상태라면 즉시 구독
    if (this.stompClient?.connected) {
      this.subscribeToClub(clubId);
      // 입장 메시지 전송
      this.sendJoinMessage(clubId, userEmail, username);
    } else {
      console.warn('STOMP client not connected, will subscribe after connection');
    }
  }

  // 채팅 메시지 전송 - 백엔드 구조에 맞춤
  sendChatMessage(clubId: number, userEmail: string, username: string, messageContent: string): void {
    // 백엔드 ChatPayloadDto 구조에 맞춘 메시지 생성
    const message = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: messageContent,
      type: 'CHAT' as const,
      timestamp: Date.now()
    };

    console.log('Sending chat message:', message);
    this.sendMessage('/app/chat.sendMessage', message);
  }

  // 입장 메시지 전송
  private sendJoinMessage(clubId: number, userEmail: string, username: string): void {
    const joinMessage = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: `${username} joined the chat`,
      type: 'JOIN' as const,
      timestamp: Date.now()
    };

    console.log('Sending join message:', joinMessage);
    this.sendMessage('/app/chat.addUser', joinMessage);
  }

  // 이미지 메시지 전송
  sendImageMessage(clubId: number, userEmail: string, username: string, imageData: string): void {
    const message = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: imageData,
      type: 'IMAGE' as const,
      timestamp: Date.now()
    };

    console.log('Sending image message:', message);
    this.sendMessage('/app/chat.sendMessage', message);
  }

  // 퇴장 메시지 전송
  private sendLeaveMessage(clubId: number, userEmail: string, username: string): void {
    const leaveMessage = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: `${username} left the chat`,
      type: 'LEAVE' as const,
      timestamp: Date.now()
    };

    console.log('Sending leave message:', leaveMessage);
    this.sendMessage('/app/chat.sendMessage', leaveMessage);
  }

  // STOMP 메시지 전송 - 에러 처리 강화
  private sendMessage(destination: string, message: any): void {
    if (!this.stompClient?.connected) {
      console.error('Cannot send message: STOMP client not connected');
      this.errorSubject.next('연결이 끊어져 메시지를 보낼 수 없습니다');
      return;
    }

    try {
      const messageBody = JSON.stringify(message);
      console.log(`Sending to ${destination}:`, messageBody);
      
      const publishParams: IPublishParams = {
        destination: destination,
        body: messageBody,
        headers: {
          'content-type': 'application/json'  // Content-Type 헤더 추가
        }
      };
      
      this.stompClient.publish(publishParams);
      console.log(`Message successfully sent to ${destination}`);
      
      // 자신이 보낸 메시지도 메모리에 저장
      if (message.type === 'CHAT' || message.type === 'IMAGE') {
        this.saveToMemory(message);
      }
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.errorSubject.next(`메시지 전송 실패: ${error}`);
    }
  }

  // 메시지 처리
  private handleMessage(message: ChatMessageDto): void {
    console.log('Processing received message:', message);
    
    // ping 메시지 무시
    if (message.message === 'ping') {
      return;
    }
    
    // 메시지를 Subject로 전달
    this.messageSubject.next(message);
    
    // 메모리에 저장
    if (message.type === 'CHAT' || message.type === 'IMAGE') {
      this.saveToMemory(message);
    }
  }

  // 재연결 시도
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      this.connectionStatus.set('disconnected');
      return;
    }

    this.reconnectAttempts++;
    this.connectionStatus.set('reconnecting');
    
    console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.currentUserEmail && this.currentUsername) {
        this.connect(this.currentUserEmail, this.currentUsername);
      }
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  // 연결 해제
  disconnect(): void {
    if (this.currentClubId !== -1) {
      this.leaveRoom();
    }
    
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.stompClient = null;
    }
    
    this.connectionStatus.set('disconnected');
    console.log('STOMP client disconnected');
  }

  // 채팅방 퇴장
  leaveRoom(): void {
    if (this.currentClubId !== -1 && this.stompClient?.connected) {
      this.sendLeaveMessage(this.currentClubId, this.currentUserEmail, this.currentUsername);
    }
    this.currentClubId = -1;
  }

  // 연결 상태 확인
  isConnected(): boolean {
    const connected = this.connectionStatus() === 'connected' && !!this.stompClient?.connected;
    console.log('Connection status check:', connected, this.connectionStatus(), !!this.stompClient?.connected);
    return connected;
  }

  // 메모리 관련 메서드들은 그대로 유지
  private saveToMemory(message: ChatMessageDto): void {
    try {
      const historyKey = `club_${message.clubId}`;
      let chatHistory = this.chatHistories.get(historyKey);
      
      if (!chatHistory) {
        chatHistory = {
          group: 'default',
          club: message.clubId.toString(),
          messages: []
        };
      }

      chatHistory.messages.push({
        senderEmail: message.senderEmail,
        senderUsername: message.senderUsername,
        type: message.type,
        message: message.message,
        timestamp: message.timestamp || Date.now()
      });

      if (chatHistory.messages.length > 50) {
        chatHistory.messages = chatHistory.messages.slice(-50);
      }

      this.chatHistories.set(historyKey, chatHistory);
      console.log(`Saved message to memory for ${historyKey}`);
    } catch (error) {
      console.error('Failed to save to memory:', error);
    }
  }

  private loadChatHistoryFromMemory(clubId: number): void {
    const historyKey = `club_${clubId}`;
    const chatHistory = this.chatHistories.get(historyKey);
    
    if (chatHistory && chatHistory.messages.length > 0) {
      console.log(`Loading ${chatHistory.messages.length} messages from memory for ${historyKey}`);
      chatHistory.messages.forEach(msg => {
        const message: ChatMessageDto = {
          clubId: clubId,
          senderEmail: msg.senderEmail,
          senderUsername: msg.senderUsername,
          type: msg.type,
          message: msg.message,
          timestamp: msg.timestamp
        };
        this.messageSubject.next(message);
      });
    }
  }

  // 유틸리티 메서드들
  getChatHistory(group: string, club: string): ChatHistory | null {
    const historyKey = `club_${club}`;
    return this.chatHistories.get(historyKey) || null;
  }

  clearAllChatHistory(): void {
    this.chatHistories.clear();
    console.log('All chat history cleared from memory');
  }

  clearChatHistory(group: string, club: string): void {
    const historyKey = `club_${club}`;
    this.chatHistories.delete(historyKey);
    console.log(`Chat history cleared for ${historyKey}`);
  }

  getAllChatRooms(): string[] {
    return Array.from(this.chatHistories.keys());
  }

  getChatMessageCount(group: string, club: string): number {
    const history = this.getChatHistory(group, club);
    return history ? history.messages.length : 0;
  }

  getCurrentClubId(): number {
    return this.currentClubId;
  }

  getCurrentUser(): { email: string; username: string } {
    return {
      email: this.currentUserEmail,
      username: this.currentUsername
    };
  }
}