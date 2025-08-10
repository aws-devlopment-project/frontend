// StompWebSocketService.ts - STOMP 기반 웹소켓 서비스 (백엔드 예시에 맞춘 수정)
import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Client, IFrame, IMessage, IPublishParams, IStompSocket } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { ChatHistory, ChatMessageDto } from '../Models/chatMessage';

// STOMP 메시지 핸들러 타입 정의
type StompMessageHandler = (message: IMessage) => void;

@Injectable({
  providedIn: 'root'
})
export class StompWebSocketService {
  private stompClient: Client | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private healthCheckInterval: any;
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

  // STOMP 연결
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
        // SockJS를 사용한 WebSocket 연결
        webSocketFactory: (): IStompSocket => new SockJS(`${serverUrl}/ws`) as IStompSocket,
        
        // 연결 헤더
        connectHeaders: {
          'userEmail': userEmail,
          'username': username
        },

        // 디버그 설정
        debug: (str: string) => {
          console.log('STOMP Debug:', str);
        },

        // 재연결 설정
        reconnectDelay: this.reconnectInterval,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,

        // 연결 성공 콜백
        onConnect: (frame: IFrame) => {
          console.log('STOMP Connected:', frame);
          this.connectionStatus.set('connected');
          this.reconnectAttempts = 0;
          this.startHealthCheck();
        },

        // 연결 실패 콜백
        onStompError: (frame: IFrame) => {
          console.error('STOMP Error:', frame);
          this.connectionStatus.set('disconnected');
          this.errorSubject.next(`STOMP 오류: ${frame.headers['message'] || '알 수 없는 오류'}`);
          this.attemptReconnect();
        },

        // 웹소켓 연결 해제 콜백
        onWebSocketClose: (event: CloseEvent) => {
          console.log('WebSocket closed:', event);
          this.connectionStatus.set('disconnected');
          this.clearHealthCheck();
          
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        },

        // 웹소켓 오류 콜백
        onWebSocketError: (event: Event) => {
          console.error('WebSocket error:', event);
          this.errorSubject.next('WebSocket 연결 오류');
        }
      });

      this.stompClient.activate();
    } catch (error) {
      console.error('Failed to create STOMP connection:', error);
      this.connectionStatus.set('disconnected');
      this.errorSubject.next('STOMP 연결 생성 실패');
    }
  }

  // 연결 해제
  disconnect(): void {
    this.clearHealthCheck();
    
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.stompClient = null;
    }
    
    this.connectionStatus.set('disconnected');
  }

  // 채팅방 입장
  joinRoom(clubId: number, userEmail: string, username: string): void {
    if (!this.stompClient?.connected) {
      console.warn('STOMP client is not connected');
      return;
    }

    // 이전 구독 해제
    if (this.currentClubId && this.currentClubId !== clubId) {
      this.leaveRoom();
    }

    this.currentClubId = clubId;
    this.currentUserEmail = userEmail;
    this.currentUsername = username;
    
    // 메모리에서 채팅 이력 로드
    this.loadChatHistoryFromMemory(clubId);
    
    // 채팅방 구독 - 백엔드 예시에 맞춘 토픽 구독
    const messageHandler: StompMessageHandler = (message: IMessage) => {
      try {
        const chatMessage: ChatMessageDto = JSON.parse(message.body);
        // 타임스탬프 추가 (백엔드에서 오지 않는 경우)
        if (!chatMessage.timestamp) {
          chatMessage.timestamp = Date.now();
        }
        this.handleMessage(chatMessage);
      } catch (error) {
        console.error('Failed to parse message:', error);
        this.errorSubject.next('메시지 파싱 오류');
      }
    };

    this.stompClient.subscribe(`/topic/chatroom/${clubId}`, messageHandler);

    // 입장 메시지 전송 - 백엔드 예시에 맞춘 JOIN 메시지
    this.sendJoinMessage(clubId, userEmail, username);
  }

  // 채팅방 퇴장
  leaveRoom(): void {
    if (this.currentClubId !== -1 && this.stompClient?.connected) {
      // 퇴장 메시지 전송
      this.sendLeaveMessage(this.currentClubId, this.currentUserEmail, this.currentUsername);
    }
    this.currentClubId = -1;
  }

  // 채팅 메시지 전송 - 백엔드 예시에 맞춘 구조
  sendChatMessage(clubId: number, userEmail: string, username: string, messageContent: string): void {
    const message: ChatMessageDto = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: messageContent,  // 백엔드 예시에 맞춰 'content' -> 'message'로 변경
      type: 'CHAT',
      timestamp: Date.now()
    };

    // 백엔드 예시에 맞춘 엔드포인트 사용
    this.sendMessage('/app/chat.sendMessage', message);
  }

  // 이미지 메시지 전송
  sendImageMessage(clubId: number, userEmail: string, username: string, imageData: string): void {
    const message: ChatMessageDto = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: imageData,
      type: 'IMAGE',
      timestamp: Date.now()
    };

    this.sendMessage('/app/chat.sendMessage', message);
  }

  // 입장 메시지 전송 - 백엔드 예시와 동일한 구조
  private sendJoinMessage(clubId: number, userEmail: string, username: string): void {
    const joinMessage: ChatMessageDto = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: `${username} joined chat room ${clubId}`,  // 백엔드 예시와 동일한 메시지
      type: 'JOIN',
      timestamp: Date.now()
    };

    // 백엔드 예시에 맞춘 엔드포인트 사용
    this.sendMessage('/app/chat.addUser', joinMessage);
  }

  // 퇴장 메시지 전송
  private sendLeaveMessage(clubId: number, userEmail: string, username: string): void {
    const leaveMessage: ChatMessageDto = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: `${username} left chat room ${clubId}`,
      type: 'LEAVE',
      timestamp: Date.now()
    };

    this.sendMessage('/app/chat.sendMessage', leaveMessage);
  }

  // STOMP 메시지 전송
  private sendMessage(destination: string, message: ChatMessageDto): void {
    if (this.stompClient?.connected) {
      const publishParams: IPublishParams = {
        destination: destination,
        body: JSON.stringify(message)
      };
      
      this.stompClient.publish(publishParams);
      console.log(`Message sent to ${destination}:`, message);
      
      // 메모리에 저장 (자신이 보낸 메시지)
      if (message.type === 'CHAT' || message.type === 'IMAGE') {
        this.saveToMemory(message);
      }
    } else {
      console.warn('STOMP client is not connected');
      this.errorSubject.next('연결이 끊어져 메시지를 보낼 수 없습니다');
    }
  }

  // 메시지 처리
  private handleMessage(message: ChatMessageDto): void {
    console.log('Received message:', message);
    
    // ping 메시지는 무시
    if (message.message === 'ping') {
      return;
    }
    
    // 메시지를 Subject로 전달
    this.messageSubject.next(message);
    
    // 메모리에 저장 (다른 사용자가 보낸 메시지)
    if (message.type === 'CHAT' || message.type === 'IMAGE') {
      this.saveToMemory(message);
    }
  }

  // 메모리에 채팅 이력 저장
  private saveToMemory(message: ChatMessageDto): void {
    try {
      // clubId를 기반으로 히스토리 키 생성
      const historyKey = `club_${message.clubId}`;
      let chatHistory = this.chatHistories.get(historyKey);
      
      if (!chatHistory) {
        chatHistory = {
          group: 'default',
          club: message.clubId.toString(),
          messages: []
        };
      }

      // 새 메시지 추가
      chatHistory.messages.push({
        senderEmail: message.senderEmail,
        senderUsername: message.senderUsername,
        type: message.type,
        message: message.message,
        timestamp: message.timestamp || Date.now()
      });

      // 최근 50개만 유지
      if (chatHistory.messages.length > 50) {
        chatHistory.messages = chatHistory.messages.slice(-50);
      }

      this.chatHistories.set(historyKey, chatHistory);
      console.log(`Saved message to memory for ${historyKey}:`, chatHistory.messages.length, 'messages');
    } catch (error) {
      console.error('Failed to save to memory:', error);
    }
  }

  // 메모리에서 채팅 이력 로드
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

  // Health Check 시작 (ping-pong)
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      if (this.stompClient?.connected && this.currentClubId !== -1) {
        // 간단한 ping 메시지 전송
        this.sendChatMessage(this.currentClubId, 'system', 'System', 'ping');
      }
    }, 30000); // 30초마다
  }

  // Health Check 정리
  private clearHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
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

  // 연결 상태 확인
  isConnected(): boolean {
    return this.connectionStatus() === 'connected' && !!this.stompClient?.connected;
  }

  // 메모리에서 채팅 이력 가져오기
  getChatHistory(group: string, club: string): ChatHistory | null {
    const historyKey = `club_${club}`;
    return this.chatHistories.get(historyKey) || null;
  }

  // 모든 채팅 이력 삭제
  clearAllChatHistory(): void {
    this.chatHistories.clear();
    console.log('All chat history cleared from memory');
  }

  // 특정 채널 채팅 이력 삭제
  clearChatHistory(group: string, club: string): void {
    const historyKey = `club_${club}`;
    this.chatHistories.delete(historyKey);
    console.log(`Chat history cleared for ${historyKey}`);
  }

  // 현재 저장된 모든 채팅방 목록 가져오기
  getAllChatRooms(): string[] {
    return Array.from(this.chatHistories.keys());
  }

  // 특정 채팅방의 메시지 수 가져오기
  getChatMessageCount(group: string, club: string): number {
    const history = this.getChatHistory(group, club);
    return history ? history.messages.length : 0;
  }

  // 현재 클럽 ID 가져오기
  getCurrentClubId(): number {
    return this.currentClubId;
  }

  // 현재 사용자 정보 가져오기
  getCurrentUser(): { email: string; username: string } {
    return {
      email: this.currentUserEmail,
      username: this.currentUsername
    };
  }
}