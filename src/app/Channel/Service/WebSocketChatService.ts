// CorrectedSimpleWebSocketService.ts
import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface SimpleChatMessage {
  chatRoomId: string;
  senderId: string;
  senderUsername: string;
  type: 'user' | 'system';
  event: 'chat' | 'load' | 'image' | 'check';
  messages: string;
  timestamp?: number;
}

export interface ChatHistory {
  group: string;
  club: string;
  messages: {
    sender: string;
    type: 'user' | 'system';
    event: 'chat' | 'load' | 'image' | 'check';
    messages: string;
    timestamp: number;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private healthCheckInterval: any;
  private currentRoomId: string = '';
  
  // 메모리 기반 채팅 이력 저장 (localStorage 대신)
  private chatHistories = new Map<string, ChatHistory>();

  // Signals
  connectionStatus = signal<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  
  // Subjects
  private messageSubject = new Subject<SimpleChatMessage>();
  private errorSubject = new Subject<string>();

  // Observables
  messages$ = this.messageSubject.asObservable();
  errors$ = this.errorSubject.asObservable();

  constructor() {
    console.log('CorrectedSimpleWebSocketService initialized');
  }

  // 연결
  connect(userId: string, username: string, serverUrl: string = 'ws://localhost:8080/chat'): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('Already connected to WebSocket');
      return;
    }

    this.connectionStatus.set('connecting');

    try {
      this.socket = new WebSocket(serverUrl);
      this.setupEventListeners();
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.connectionStatus.set('disconnected');
      this.errorSubject.next('WebSocket 연결 생성 실패');
    }
  }

  // 연결 해제
  disconnect(): void {
    this.clearHealthCheck();
    
    if (this.socket) {
      this.socket.close(1000, 'User disconnected');
      this.socket = null;
    }
    
    this.connectionStatus.set('disconnected');
  }

  // 채팅방 입장
  joinRoom(roomId: string, userId: string, username: string): void {
    this.currentRoomId = roomId;
    
    // 메모리에서 채팅 이력 로드
    this.loadChatHistoryFromMemory(roomId);
    
    // 서버에 채팅 이력 로드 요청
    this.sendMessage({
      chatRoomId: roomId,
      senderId: userId,
      senderUsername: username,
      type: 'user',
      event: 'load',
      messages: ''
    });
  }

  // 메시지 전송
  sendChatMessage(roomId: string, userId: string, username: string, message: string): void {
    this.sendMessage({
      chatRoomId: roomId,
      senderId: userId,
      senderUsername: username,
      type: 'user',
      event: 'chat',
      messages: message
    });
  }

  // 이미지 전송
  sendImageMessage(roomId: string, userId: string, username: string, imageData: string): void {
    this.sendMessage({
      chatRoomId: roomId,
      senderId: userId,
      senderUsername: username,
      type: 'user',
      event: 'image',
      messages: imageData
    });
  }

  // 일반 메시지 전송
  private sendMessage(message: SimpleChatMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      message.timestamp = Date.now();
      this.socket.send(JSON.stringify(message));
      
      // 메모리에 저장 (자신이 보낸 메시지)
      if (message.event === 'chat' || message.event === 'image') {
        this.saveToMemory(message);
      }
    } else {
      console.warn('WebSocket is not connected');
      this.errorSubject.next('연결이 끊어져 메시지를 보낼 수 없습니다');
    }
  }

  // 이벤트 리스너 설정
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.connectionStatus.set('connected');
      this.reconnectAttempts = 0;
      this.startHealthCheck();
    };

    this.socket.onmessage = (event) => {
      try {
        const message: SimpleChatMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
        this.errorSubject.next('메시지 파싱 오류');
      }
    };

    this.socket.onclose = (event) => {
      console.log('WebSocket disconnected:', event);
      this.connectionStatus.set('disconnected');
      this.clearHealthCheck();
      
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect();
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.errorSubject.next('WebSocket 연결 오류');
    };
  }

  // 메시지 처리
  private handleMessage(message: SimpleChatMessage): void {
    if (message.event === 'check') {
      // Health check 응답 처리
      if (message.messages === 'ping') {
        // 서버에서 ping이 오면 pong 응답
        this.sendMessage({
          chatRoomId: this.currentRoomId,
          senderId: 'client',
          senderUsername: 'Client',
          type: 'system',
          event: 'check',
          messages: 'pong'
        });
      }
      return;
    }

    if (message.event === 'load' && message.type === 'system') {
      // 채팅 이력 로드
      try {
        const history: SimpleChatMessage[] = JSON.parse(message.messages);
        history.forEach(msg => {
          this.messageSubject.next(msg);
          this.saveToMemory(msg);
        });
      } catch (error) {
        console.error('Failed to parse chat history:', error);
      }
      return;
    }

    // 일반 메시지 처리
    this.messageSubject.next(message);
    
    // 메모리에 저장 (다른 사용자가 보낸 메시지)
    if (message.event === 'chat' || message.event === 'image') {
      this.saveToMemory(message);
    }
  }

  // 메모리에 채팅 이력 저장 (localStorage 대신)
  private saveToMemory(message: SimpleChatMessage): void {
    try {
      // 채팅방 ID를 group-club 형식으로 파싱
      const [group, club] = message.chatRoomId.split('-');
      if (!group || !club) return;

      const historyKey = `${group}_${club}`;
      let chatHistory = this.chatHistories.get(historyKey);
      
      if (!chatHistory) {
        chatHistory = {
          group,
          club,
          messages: []
        };
      }

      // 새 메시지 추가
      chatHistory.messages.push({
        sender: message.senderUsername,
        type: message.type,
        event: message.event,
        messages: message.messages,
        timestamp: message.timestamp || Date.now()
      });

      // 최근 30개만 유지
      if (chatHistory.messages.length > 30) {
        chatHistory.messages = chatHistory.messages.slice(-30);
      }

      this.chatHistories.set(historyKey, chatHistory);
      console.log(`Saved message to memory for ${historyKey}:`, chatHistory.messages.length, 'messages');
    } catch (error) {
      console.error('Failed to save to memory:', error);
    }
  }

  // 메모리에서 채팅 이력 로드
  private loadChatHistoryFromMemory(roomId: string): void {
    const [group, club] = roomId.split('-');
    if (!group || !club) return;

    const historyKey = `${group}_${club}`;
    const chatHistory = this.chatHistories.get(historyKey);
    
    if (chatHistory && chatHistory.messages.length > 0) {
      console.log(`Loading ${chatHistory.messages.length} messages from memory for ${historyKey}`);
      chatHistory.messages.forEach(msg => {
        const message: SimpleChatMessage = {
          chatRoomId: roomId,
          senderId: msg.sender === 'You' ? 'current-user' : 'other-user',
          senderUsername: msg.sender,
          type: msg.type,
          event: msg.event,
          messages: msg.messages,
          timestamp: msg.timestamp
        };
        this.messageSubject.next(message);
      });
    }
  }

  // 메모리에서 채팅 이력 가져오기
  getChatHistory(group: string, club: string): ChatHistory | null {
    const historyKey = `${group}_${club}`;
    return this.chatHistories.get(historyKey) || null;
  }

  // Health Check 시작
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN && this.currentRoomId) {
        this.sendMessage({
          chatRoomId: this.currentRoomId,
          senderId: 'client',
          senderUsername: 'Client',
          type: 'system',
          event: 'check',
          messages: 'ping'
        });
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
    this.reconnectAttempts++;
    this.connectionStatus.set('reconnecting');
    
    console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      // 기존 연결 정보로 재연결
      this.connect('user', 'User');
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  // 연결 상태 확인
  isConnected(): boolean {
    return this.connectionStatus() === 'connected';
  }

  // 모든 채팅 이력 삭제
  clearAllChatHistory(): void {
    this.chatHistories.clear();
    console.log('All chat history cleared from memory');
  }

  // 특정 채널 채팅 이력 삭제
  clearChatHistory(group: string, club: string): void {
    const historyKey = `${group}_${club}`;
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
}