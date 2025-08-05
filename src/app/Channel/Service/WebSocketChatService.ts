import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { ChatMessage } from '../Models/chatMessage';
import { UserStatus } from '../../Core/Models/user';

export interface TypingUser {
  userId: string;
  username: string;
  channelId: string;
  timestamp: Date;
}

export interface WebSocketMessage {
  type: 'message' | 'user_joined' | 'user_left' | 'typing_start' | 'typing_stop' | 'user_status' | 'channel_users'
    | 'leave_channel' | 'join_channel' | 'user_info';
  payload: any;
  channelId?: string;
  userId?: string;
  timestamp?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketChatService {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private pingInterval: any;
  private typingTimeout: any;

  // Signals for reactive state management
  connectionStatus = signal<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  currentUser = signal<UserStatus | null>(null);
  onlineUsers = signal<UserStatus[]>([]);
  typingUsers = signal<TypingUser[]>([]);
  
  // Subjects for message streams
  private messageSubject = new Subject<ChatMessage>();
  private userJoinedSubject = new Subject<UserStatus>();
  private userLeftSubject = new Subject<UserStatus>();
  private errorSubject = new Subject<string>();

  // Public observables
  messages$ = this.messageSubject.asObservable();
  userJoined$ = this.userJoinedSubject.asObservable();
  userLeft$ = this.userLeftSubject.asObservable();
  errors$ = this.errorSubject.asObservable();

  // Computed properties
  isConnected = computed(() => this.connectionStatus() === 'connected');
  typingUsersInChannel = computed(() => {
    const currentChannel = this.getCurrentChannel();
    return this.typingUsers().filter(user => user.channelId === currentChannel);
  });

  constructor() {
    console.log('WebSocketChatService initialized');
  }

  // === Connection Management ===
  connect(user: UserStatus, serverUrl: string = 'ws://localhost:8080/chat'): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('Already connected to WebSocket');
      return;
    }

    this.connectionStatus.set('connecting');
    this.currentUser.set(user);

    try {
      this.socket = new WebSocket(`${serverUrl}?userId=${user.id}&username=${encodeURIComponent(user.name)}`);
      this.setupEventListeners();
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.connectionStatus.set('disconnected');
      this.errorSubject.next('WebSocket 연결 생성에 실패했습니다');
    }
  }

  disconnect(): void {
    this.clearPingInterval();
    this.clearTypingTimeout();
    
    if (this.socket) {
      this.socket.close(1000, 'User disconnected');
      this.socket = null;
    }
    
    this.connectionStatus.set('disconnected');
    this.onlineUsers.set([]);
    this.typingUsers.set([]);
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.onopen = (event) => {
      console.log('WebSocket connected:', event);
      this.connectionStatus.set('connected');
      this.reconnectAttempts = 0;
      this.startPingInterval();
      
      // Send user info after connection
      this.sendUserInfo();
    };

    this.socket.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        this.errorSubject.next('메시지 파싱 오류');
      }
    };

    this.socket.onclose = (event) => {
      console.log('WebSocket disconnected:', event);
      this.connectionStatus.set('disconnected');
      this.clearPingInterval();
      
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect();
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.errorSubject.next('WebSocket 연결 오류가 발생했습니다');
    };
  }

  private handleMessage(data: WebSocketMessage): void {
    switch (data.type) {
      case 'message':
        const message: ChatMessage = {
          ...data.payload,
          timestamp: new Date(data.payload.timestamp)
        };
        this.messageSubject.next(message);
        break;

      case 'user_joined':
        const joinedUser: UserStatus = data.payload;
        this.userJoinedSubject.next(joinedUser);
        this.updateOnlineUsers(joinedUser, 'add');
        break;

      case 'user_left':
        const leftUser: UserStatus = data.payload;
        this.userLeftSubject.next(leftUser);
        this.updateOnlineUsers(leftUser, 'remove');
        break;

      case 'typing_start':
        this.addTypingUser(data.payload);
        break;

      case 'typing_stop':
        this.removeTypingUser(data.payload.userId, data.payload.channelId);
        break;

      case 'user_status':
        this.updateUserStatus(data.payload);
        break;

      case 'channel_users':
        this.onlineUsers.set(data.payload.users || []);
        break;

      default:
        console.warn('Unknown message type:', data.type);
    }
  }

  // === Message Sending ===
  sendMessage(content: string, channelId: string): void {
    if (!this.isConnected() || !this.currentUser()) return;

    const message: ChatMessage = {
      id: this.generateMessageId(),
      userId: this.currentUser()!.id,
      username: this.currentUser()!.name,
      avatar: this.currentUser()!.avatar,
      content: content.trim(),
      timestamp: new Date(),
      type: 'text',
      channelId
    };

    this.sendWebSocketMessage({
      type: 'message',
      payload: message,
      channelId,
      userId: this.currentUser()!.id
    });
  }

  // === Channel Management ===
  joinChannel(channelId: string): void {
    if (!this.isConnected()) return;

    this.sendWebSocketMessage({
      type: 'join_channel',
      payload: { channelId },
      userId: this.currentUser()?.id
    });
  }

  leaveChannel(channelId: string): void {
    if (!this.isConnected()) return;

    this.sendWebSocketMessage({
      type: 'leave_channel',
      payload: { channelId },
      userId: this.currentUser()?.id
    });
  }

  // === Typing Indicators ===
  startTyping(channelId: string): void {
    if (!this.isConnected()) return;

    this.sendWebSocketMessage({
      type: 'typing_start',
      payload: { channelId },
      userId: this.currentUser()?.id
    });

    // Auto-stop typing after 3 seconds
    this.clearTypingTimeout();
    this.typingTimeout = setTimeout(() => {
      this.stopTyping(channelId);
    }, 3000);
  }

  stopTyping(channelId: string): void {
    if (!this.isConnected()) return;

    this.sendWebSocketMessage({
      type: 'typing_stop',
      payload: { channelId },
      userId: this.currentUser()?.id
    });

    this.clearTypingTimeout();
  }

  // === User Status Management ===
  updateStatus(status: UserStatus['status']): void {
    if (!this.isConnected() || !this.currentUser()) return;

    const updatedUser = { ...this.currentUser()!, status };
    this.currentUser.set(updatedUser);

    this.sendWebSocketMessage({
      type: 'user_status',
      payload: { status },
      userId: this.currentUser()!.id
    });
  }

  // === Private Helper Methods ===
  private sendWebSocketMessage(message: WebSocketMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        ...message,
        timestamp: new Date()
      }));
    } else {
      console.warn('WebSocket is not connected. Cannot send message:', message);
      this.errorSubject.next('연결이 끊어져 메시지를 보낼 수 없습니다');
    }
  }

  private sendUserInfo(): void {
    if (!this.currentUser()) return;

    this.sendWebSocketMessage({
      type: 'user_info',
      payload: this.currentUser(),
      userId: this.currentUser()!.id
    });
  }

  private updateOnlineUsers(user: UserStatus, action: 'add' | 'remove'): void {
    const currentUsers = this.onlineUsers();
    
    if (action === 'add') {
      const existingIndex = currentUsers.findIndex(u => u.id === user.id);
      if (existingIndex >= 0) {
        currentUsers[existingIndex] = user;
      } else {
        currentUsers.push(user);
      }
    } else {
      const filteredUsers = currentUsers.filter(u => u.id !== user.id);
      this.onlineUsers.set(filteredUsers);
      return;
    }
    
    this.onlineUsers.set([...currentUsers]);
  }

  private updateUserStatus(payload: { userId: string; status: UserStatus['status'] }): void {
    const users = this.onlineUsers();
    const userIndex = users.findIndex(u => u.id === payload.userId);
    
    if (userIndex >= 0) {
      users[userIndex].status = payload.status;
      this.onlineUsers.set([...users]);
    }
  }

  private addTypingUser(payload: { userId: string; username: string; channelId: string }): void {
    const typingUser: TypingUser = {
      ...payload,
      timestamp: new Date()
    };
    
    const currentTyping = this.typingUsers();
    const existingIndex = currentTyping.findIndex(
      u => u.userId === payload.userId && u.channelId === payload.channelId
    );
    
    if (existingIndex >= 0) {
      currentTyping[existingIndex] = typingUser;
    } else {
      currentTyping.push(typingUser);
    }
    
    this.typingUsers.set([...currentTyping]);
  }

  private removeTypingUser(userId: string, channelId: string): void {
    const currentTyping = this.typingUsers();
    const filtered = currentTyping.filter(
      u => !(u.userId === userId && u.channelId === channelId)
    );
    this.typingUsers.set(filtered);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Ping every 30 seconds
  }

  private clearPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private clearTypingTimeout(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    this.connectionStatus.set('reconnecting');
    
    console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.currentUser()) {
        this.connect(this.currentUser()!);
      }
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentChannel(): string {
    // This should be integrated with your SharedStateService
    return 'general'; // Placeholder
  }

  // === Public Getters ===
  getOnlineUsersCount(): number {
    return this.onlineUsers().length;
  }

  getTypingUsersText(channelId: string): string {
    const typing = this.typingUsers().filter(u => u.channelId === channelId);
    
    if (typing.length === 0) return '';
    if (typing.length === 1) return `${typing[0].username}님이 입력 중...`;
    if (typing.length === 2) return `${typing[0].username}님과 ${typing[1].username}님이 입력 중...`;
    return `${typing[0].username}님 외 ${typing.length - 1}명이 입력 중...`;
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers().some(user => user.id === userId && user.status === 'online');
  }
}