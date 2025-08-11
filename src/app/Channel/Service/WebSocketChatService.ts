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
    console.log('🚀 StompWebSocketService initialized');
  }

  // STOMP 연결 - 디버깅 로그 강화
  connect(userEmail: string, username: string, serverUrl: string = 'http://localhost:9001'): void {
    console.log('📡 STOMP 연결 시도 시작');
    console.log('┌─ 연결 파라미터:');
    console.log('├── userEmail:', userEmail);
    console.log('├── username:', username);
    console.log('├── serverUrl:', serverUrl);
    console.log('└── 현재 연결 상태:', this.stompClient?.connected);

    if (this.stompClient?.connected) {
      console.log('⚠️ 이미 STOMP 서버에 연결되어 있습니다');
      return;
    }

    this.currentUserEmail = userEmail;
    this.currentUsername = username;
    this.connectionStatus.set('connecting');

    try {
      const sockjsUrl = `${serverUrl}/ws`;
      console.log('🔗 SockJS URL 생성:', sockjsUrl);

      this.stompClient = new Client({
        // SockJS URL 수정 - 백엔드 설정과 일치
        webSocketFactory: () => {
          console.log('🏭 SockJS 팩토리 실행, URL:', sockjsUrl);
          const socket = new SockJS(sockjsUrl);
          
          // SockJS 이벤트 로깅
          socket.onopen = () => console.log('📡 SockJS 연결 열림');
          socket.onclose = (event) => console.log('📡 SockJS 연결 닫힘:', event.code, event.reason);
          socket.onerror = (error) => console.error('📡 SockJS 오류:', error);
          
          return socket as any;
        },
        
        // 연결 헤더 - 백엔드에서 필요한 경우
        connectHeaders: {
          'userEmail': userEmail,
          'username': username
        },

        // 디버그 출력 개선
        debug: (str: string) => {
          console.log('🔍 STOMP Debug:', str);
        },

        // 재연결 및 하트비트 설정
        reconnectDelay: this.reconnectInterval,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,

        // 연결 성공 콜백
        onConnect: (frame: IFrame) => {
          console.log('✅ STOMP 연결 성공!');
          console.log('┌─ 연결 프레임:');
          console.log('├── Headers:', frame.headers);
          console.log('├── Body:', frame.body);
          console.log('├── Command:', frame.command);
          console.log('└── 연결된 서버:', sockjsUrl);
          
          this.connectionStatus.set('connected');
          this.reconnectAttempts = 0;
          
          // 연결 후 즉시 현재 클럽 구독
          if (this.currentClubId !== -1) {
            console.log('🔄 연결 완료 후 기존 클럽 자동 구독:', this.currentClubId);
            this.subscribeToClub(this.currentClubId);
          } else {
            console.log('ℹ️ 연결 완료, 구독할 클럽 없음');
          }
        },

        // STOMP 오류 콜백
        onStompError: (frame: IFrame) => {
          console.error('❌ STOMP 오류 발생!');
          console.error('┌─ 오류 프레임:');
          console.error('├── Headers:', frame.headers);
          console.error('├── Body:', frame.body);
          console.error('├── Command:', frame.command);
          console.error('└── Message:', frame.headers['message']);
          
          this.connectionStatus.set('disconnected');
          const errorMessage = frame.headers['message'] || frame.body || '알 수 없는 STOMP 오류';
          this.errorSubject.next(`STOMP 오류: ${errorMessage}`);
          this.attemptReconnect();
        },

        // 웹소켓 연결 해제 콜백
        onWebSocketClose: (event: CloseEvent) => {
          console.log('🔌 WebSocket 연결 해제');
          console.log('┌─ 해제 정보:');
          console.log('├── Code:', event.code);
          console.log('├── Reason:', event.reason);
          console.log('├── WasClean:', event.wasClean);
          console.log('└── 재연결 시도 횟수:', this.reconnectAttempts);
          
          this.connectionStatus.set('disconnected');
          
          // 정상 종료가 아닌 경우에만 재연결
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            console.log('🔄 비정상 종료 감지, 재연결 시도 예약');
            this.attemptReconnect();
          } else if (event.code === 1000) {
            console.log('✅ 정상 종료, 재연결하지 않음');
          } else {
            console.log('🚫 최대 재연결 횟수 초과');
          }
        },

        // 웹소켓 오류 콜백
        onWebSocketError: (event: Event) => {
          console.error('🚨 WebSocket 오류:', event);
          this.errorSubject.next('WebSocket 연결 오류');
        }
      });

      console.log('⚡ STOMP 클라이언트 생성 완료, 활성화 시작...');
      
      // 연결 활성화
      this.stompClient.activate();
      console.log('🔥 STOMP 클라이언트 활성화 완료');
      
    } catch (error) {
      console.error('💥 STOMP 연결 생성 실패:', error);
      this.connectionStatus.set('disconnected');
      this.errorSubject.next(`STOMP 연결 생성 실패: ${error}`);
    }
  }

  // 클럽 구독 분리 - 디버깅 로그 강화
  private subscribeToClub(clubId: number): void {
    console.log('📬 클럽 구독 시작');
    console.log('┌─ 구독 정보:');
    console.log('├── Club ID:', clubId);
    console.log('├── STOMP 연결 상태:', !!this.stompClient?.connected);
    console.log('└── 현재 사용자:', this.currentUsername, '(' + this.currentUserEmail + ')');

    if (!this.stompClient?.connected) {
      console.warn('⚠️ STOMP 클라이언트가 연결되지 않아 구독할 수 없습니다');
      return;
    }

    const topic = `/topic/chatroom/${clubId}`;
    console.log('📡 구독 토픽:', topic);

    try {
      const subscription = this.stompClient.subscribe(topic, (message: IMessage) => {
        console.log('📨 메시지 수신!');
        console.log('┌─ Raw 메시지:');
        console.log('├── Headers:', message.headers);
        console.log('├── Body:', message.body);
        console.log('├── Ack:', message.ack);
        console.log('├── Nack:', message.nack);
        console.log('└── 수신 시각:', new Date().toISOString());
        
        try {
          const chatMessage: ChatMessageDto = JSON.parse(message.body);
          console.log('✅ 메시지 파싱 성공:');
          console.log('┌─ 파싱된 메시지:');
          console.log('├── Club ID:', chatMessage.clubId);
          console.log('├── 발신자 이메일:', chatMessage.senderEmail);
          console.log('├── 발신자 이름:', chatMessage.senderUsername);
          console.log('├── 메시지 타입:', chatMessage.type);
          console.log('├── 메시지 내용:', chatMessage.message);
          console.log('└── 타임스탬프:', chatMessage.timestamp);
          
          // 타임스탬프 보정
          if (!chatMessage.timestamp) {
            chatMessage.timestamp = Date.now();
            console.log('⏰ 타임스탬프 없음, 현재 시간으로 설정:', chatMessage.timestamp);
          }
          
          this.handleMessage(chatMessage);
        } catch (parseError) {
          console.error('💥 메시지 파싱 오류:', parseError);
          console.error('파싱 실패한 Raw body:', message.body);
          this.errorSubject.next('메시지 파싱 오류');
        }
      });

      console.log('✅ 구독 성공:', topic);
      console.log('📋 구독 객체:', subscription);
    } catch (subscribeError) {
      console.error('💥 구독 실패:', subscribeError);
      this.errorSubject.next('구독 실패');
    }
  }

  // 채팅방 입장 - 디버깅 로그 강화
  joinRoom(clubId: number, userEmail: string, username: string): void {
    console.log('🚪 채팅방 입장 시작');
    console.log('┌─ 입장 정보:');
    console.log('├── Club ID:', clubId);
    console.log('├── 사용자 이메일:', userEmail);
    console.log('├── 사용자 이름:', username);
    console.log('├── 이전 Club ID:', this.currentClubId);
    console.log('├── STOMP 연결 상태:', !!this.stompClient?.connected);
    console.log('└── 연결 상태 Signal:', this.connectionStatus());
    
    this.currentClubId = clubId;
    this.currentUserEmail = userEmail;
    this.currentUsername = username;
    
    // 메모리에서 채팅 이력 로드
    console.log('💾 메모리에서 채팅 이력 로드 시작...');
    this.loadChatHistoryFromMemory(clubId);
    
    // 연결된 상태라면 즉시 구독
    if (this.stompClient?.connected) {
      console.log('✅ STOMP 연결됨, 즉시 구독 및 입장 메시지 전송');
      this.subscribeToClub(clubId);
      this.sendJoinMessage(clubId, userEmail, username);
    } else {
      console.warn('⚠️ STOMP 연결되지 않음, 연결 후 구독 예정');
    }
  }

  // 채팅 메시지 전송 - 디버깅 로그 강화
  sendChatMessage(clubId: number, userEmail: string, username: string, messageContent: string): void {
    console.log('💬 채팅 메시지 전송 시작');
    
    // 백엔드 ChatPayloadDto 구조에 맞춘 메시지 생성
    const message = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: messageContent,
      type: 'CHAT' as const,
      timestamp: Date.now()
    };

    console.log('┌─ 생성된 채팅 메시지:');
    console.log('├── Club ID:', message.clubId);
    console.log('├── 발신자 이메일:', message.senderEmail);
    console.log('├── 발신자 이름:', message.senderUsername);
    console.log('├── 메시지 내용:', message.message);
    console.log('├── 메시지 타입:', message.type);
    console.log('├── 타임스탬프:', message.timestamp);
    console.log('└── 목적지:', '/app/chat.sendMessage');

    this.sendMessage('/app/chat.sendMessage', message);
  }

  // 입장 메시지 전송 - 디버깅 로그 강화
  private sendJoinMessage(clubId: number, userEmail: string, username: string): void {
    console.log('🔑 입장 메시지 전송 시작');
    
    const joinMessage = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: `${username} joined chat room ${clubId}`, // 백엔드 예시와 동일
      type: 'JOIN' as const,
      timestamp: Date.now()
    };

    console.log('┌─ 생성된 입장 메시지:');
    console.log('├── Club ID:', joinMessage.clubId);
    console.log('├── 발신자 이메일:', joinMessage.senderEmail);
    console.log('├── 발신자 이름:', joinMessage.senderUsername);
    console.log('├── 메시지 내용:', joinMessage.message);
    console.log('├── 메시지 타입:', joinMessage.type);
    console.log('├── 타임스탬프:', joinMessage.timestamp);
    console.log('└── 목적지:', '/app/chat.addUser');

    this.sendMessage('/app/chat.addUser', joinMessage);
  }

  // 이미지 메시지 전송 - 디버깅 로그 강화
  sendImageMessage(clubId: number, userEmail: string, username: string, imageData: string): void {
    console.log('🖼️ 이미지 메시지 전송 시작');
    
    const message = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: imageData,
      type: 'IMAGE' as const,
      timestamp: Date.now()
    };

    console.log('┌─ 생성된 이미지 메시지:');
    console.log('├── Club ID:', message.clubId);
    console.log('├── 발신자 이메일:', message.senderEmail);
    console.log('├── 발신자 이름:', message.senderUsername);
    console.log('├── 이미지 데이터 길이:', message.message.length);
    console.log('├── 메시지 타입:', message.type);
    console.log('├── 타임스탬프:', message.timestamp);
    console.log('└── 목적지:', '/app/chat.sendMessage');

    this.sendMessage('/app/chat.sendMessage', message);
  }

  // 퇴장 메시지 전송 - 디버깅 로그 강화
  private sendLeaveMessage(clubId: number, userEmail: string, username: string): void {
    console.log('🚪 퇴장 메시지 전송 시작');
    
    const leaveMessage = {
      clubId: clubId,
      senderEmail: userEmail,
      senderUsername: username,
      message: `${username} left chat room ${clubId}`,
      type: 'LEAVE' as const,
      timestamp: Date.now()
    };

    console.log('┌─ 생성된 퇴장 메시지:');
    console.log('├── Club ID:', leaveMessage.clubId);
    console.log('├── 발신자 이메일:', leaveMessage.senderEmail);
    console.log('├── 발신자 이름:', leaveMessage.senderUsername);
    console.log('├── 메시지 내용:', leaveMessage.message);
    console.log('├── 메시지 타입:', leaveMessage.type);
    console.log('├── 타임스탬프:', leaveMessage.timestamp);
    console.log('└── 목적지:', '/app/chat.sendMessage');

    this.sendMessage('/app/chat.sendMessage', leaveMessage);
  }

  // STOMP 메시지 전송 - 디버깅 로그 대폭 강화
  private sendMessage(destination: string, message: any): void {
    console.log('📤 STOMP 메시지 전송 시작');
    console.log('┌─ 전송 정보:');
    console.log('├── 목적지:', destination);
    console.log('├── STOMP 연결 상태:', !!this.stompClient?.connected);
    console.log('├── 연결 상태 Signal:', this.connectionStatus());
    console.log('└── 메시지 객체:', message);

    if (!this.stompClient?.connected) {
      console.error('❌ STOMP 클라이언트가 연결되지 않아 메시지를 보낼 수 없습니다');
      console.error('현재 상태:', this.connectionStatus());
      this.errorSubject.next('연결이 끊어져 메시지를 보낼 수 없습니다');
      return;
    }

    try {
      const messageBody = JSON.stringify(message);
      console.log('📦 메시지 JSON 직렬화 완료');
      console.log('┌─ 직렬화된 메시지:');
      console.log('├── JSON 길이:', messageBody.length);
      console.log('├── JSON 내용:', messageBody);
      console.log('└── 목적지:', destination);
      
      const publishParams: IPublishParams = {
        destination: destination,
        body: messageBody,
        headers: {
          'content-type': 'application/json'
        }
      };
      
      console.log('📋 STOMP 발행 파라미터 생성:');
      console.log('┌─ 발행 파라미터:');
      console.log('├── destination:', publishParams.destination);
      console.log('├── body length:', publishParams.body?.length);
      console.log('├── headers:', publishParams.headers);
      console.log('└── 전송 시각:', new Date().toISOString());
      
      // 실제 전송
      console.log('🚀 STOMP 메시지 발행 시작...');
      this.stompClient.publish(publishParams);
      console.log('✅ STOMP 메시지 발행 완료!');
      
      // 자신이 보낸 메시지도 메모리에 저장
      if (message.type === 'CHAT' || message.type === 'IMAGE') {
        console.log('💾 자신이 보낸 메시지 메모리 저장');
        this.saveToMemory(message);
      } else {
        console.log('ℹ️ JOIN/LEAVE 메시지는 메모리에 저장하지 않음');
      }
      
    } catch (error) {
      console.error('💥 메시지 전송 실패:', error);
      console.error('실패한 목적지:', destination);
      console.error('실패한 메시지:', message);
      this.errorSubject.next(`메시지 전송 실패: ${error}`);
    }
  }

  // 메시지 처리 - 디버깅 로그 강화
  private handleMessage(message: ChatMessageDto): void {
    console.log('📥 메시지 처리 시작');
    console.log('┌─ 처리할 메시지:');
    console.log('├── Club ID:', message.clubId);
    console.log('├── 발신자:', message.senderUsername, '(' + message.senderEmail + ')');
    console.log('├── 타입:', message.type);
    console.log('├── 내용:', message.message);
    console.log('├── 타임스탬프:', message.timestamp);
    console.log('└── 현재 Club ID:', this.currentClubId);
    
    // ping 메시지 무시
    if (message.message === 'ping') {
      console.log('🏓 ping 메시지 무시');
      return;
    }
    
    // 메시지를 Subject로 전달
    console.log('📡 메시지를 Subject로 전달');
    this.messageSubject.next(message);
    
    // 메모리에 저장
    if (message.type === 'CHAT' || message.type === 'IMAGE' || message.type === 'JOIN' || message.type === 'LEAVE') {
      console.log('💾 메시지 메모리 저장 시작');
      this.saveToMemory(message);
    } else {
      console.log('ℹ️ 알 수 없는 메시지 타입, 메모리 저장 스킵:', message.type);
    }
  }

  // 재연결 시도 - 디버깅 로그 강화
  private attemptReconnect(): void {
    console.log('🔄 재연결 시도');
    console.log('┌─ 재연결 정보:');
    console.log('├── 현재 시도 횟수:', this.reconnectAttempts);
    console.log('├── 최대 시도 횟수:', this.maxReconnectAttempts);
    console.log('├── 재연결 간격:', this.reconnectInterval);
    console.log('└── 사용자 정보:', this.currentUsername, '(' + this.currentUserEmail + ')');

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('🚫 최대 재연결 시도 횟수 도달, 재연결 중단');
      this.connectionStatus.set('disconnected');
      return;
    }

    this.reconnectAttempts++;
    this.connectionStatus.set('reconnecting');
    
    const delay = this.reconnectInterval * this.reconnectAttempts;
    console.log(`⏳ ${delay}ms 후 재연결 시도 예약 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.currentUserEmail && this.currentUsername) {
        console.log('🔄 재연결 실행:', this.currentUserEmail, this.currentUsername);
        this.connect(this.currentUserEmail, this.currentUsername);
      } else {
        console.error('❌ 재연결 실패: 사용자 정보 없음');
      }
    }, delay);
  }

  // 연결 해제 - 디버깅 로그 강화
  disconnect(): void {
    console.log('🔌 STOMP 연결 해제 시작');
    console.log('┌─ 해제 정보:');
    console.log('├── 현재 Club ID:', this.currentClubId);
    console.log('├── STOMP 클라이언트 존재:', !!this.stompClient);
    console.log('├── 연결 상태:', this.connectionStatus());
    console.log('└── 사용자:', this.currentUsername);

    if (this.currentClubId !== -1) {
      console.log('🚪 현재 채팅방에서 나가기');
      this.leaveRoom();
    }
    
    if (this.stompClient) {
      console.log('⚡ STOMP 클라이언트 비활성화');
      this.stompClient.deactivate();
      this.stompClient = null;
      console.log('✅ STOMP 클라이언트 정리 완료');
    }
    
    this.connectionStatus.set('disconnected');
    console.log('✅ STOMP 클라이언트 연결 해제 완료');
  }

  // 채팅방 퇴장 - 디버깅 로그 강화
  leaveRoom(): void {
    console.log('🚪 채팅방 퇴장 시작');
    console.log('┌─ 퇴장 정보:');
    console.log('├── 현재 Club ID:', this.currentClubId);
    console.log('├── STOMP 연결 상태:', !!this.stompClient?.connected);
    console.log('├── 사용자 이메일:', this.currentUserEmail);
    console.log('└── 사용자 이름:', this.currentUsername);

    if (this.currentClubId !== -1 && this.stompClient?.connected) {
      console.log('📤 퇴장 메시지 전송');
      this.sendLeaveMessage(this.currentClubId, this.currentUserEmail, this.currentUsername);
    } else {
      console.log('ℹ️ 퇴장 메시지 전송 스킵 (연결 없음 또는 방 없음)');
    }
    
    this.currentClubId = -1;
    console.log('✅ 현재 Club ID 초기화 완료');
  }

  // 연결 상태 확인 - 디버깅 로그 강화
  isConnected(): boolean {
    const signalStatus = this.connectionStatus();
    const clientConnected = !!this.stompClient?.connected;
    const finalConnected = signalStatus === 'connected' && clientConnected;
    
    console.log('🔍 연결 상태 확인:');
    console.log('┌─ 상태 정보:');
    console.log('├── Signal 상태:', signalStatus);
    console.log('├── 클라이언트 연결:', clientConnected);
    console.log('├── 최종 연결 상태:', finalConnected);
    console.log('└── STOMP 클라이언트 존재:', !!this.stompClient);
    
    return finalConnected;
  }

  // 메모리 저장 - 디버깅 로그 추가
  private saveToMemory(message: ChatMessageDto): void {
    try {
      const historyKey = `club_${message.clubId}`;
      console.log('💾 메모리 저장:', historyKey);
      
      let chatHistory = this.chatHistories.get(historyKey);
      
      if (!chatHistory) {
        console.log('📝 새 채팅 이력 생성:', historyKey);
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
        const oldLength = chatHistory.messages.length;
        chatHistory.messages = chatHistory.messages.slice(-50);
        console.log(`✂️ 메시지 제한 (${oldLength} → 50)`);
      }

      this.chatHistories.set(historyKey, chatHistory);
      console.log(`✅ 메모리 저장 완료: ${historyKey} (총 ${chatHistory.messages.length}개)`);
    } catch (error) {
      console.error('💥 메모리 저장 실패:', error);
    }
  }

  private loadChatHistoryFromMemory(clubId: number): void {
    const historyKey = `club_${clubId}`;
    console.log('📖 메모리에서 채팅 이력 로드:', historyKey);
    
    const chatHistory = this.chatHistories.get(historyKey);
    
    if (chatHistory && chatHistory.messages.length > 0) {
      console.log(`📚 ${chatHistory.messages.length}개 메시지 로드:`, historyKey);
      chatHistory.messages.forEach((msg, index) => {
        const message: ChatMessageDto = {
          clubId: clubId,
          senderEmail: msg.senderEmail,
          senderUsername: msg.senderUsername,
          type: msg.type,
          message: msg.message,
          timestamp: msg.timestamp
        };
        console.log(`📄 [${index + 1}/${chatHistory.messages.length}] ${msg.type} - ${msg.senderUsername}: ${msg.message.substring(0, 50)}...`);
        this.messageSubject.next(message);
      });
      console.log('✅ 메모리 로드 완료');
    } else {
      console.log('ℹ️ 로드할 채팅 이력 없음:', historyKey);
    }
  }

  // 유틸리티 메서드들 - 디버깅 로그 추가
  getChatHistory(group: string, club: string): ChatHistory | null {
    const historyKey = `club_${club}`;
    const history = this.chatHistories.get(historyKey) || null;
    console.log('🔍 채팅 이력 조회:', historyKey, history ? `${history.messages.length}개 메시지` : '없음');
    return history;
  }

  clearAllChatHistory(): void {
    const roomCount = this.chatHistories.size;
    this.chatHistories.clear();
    console.log(`🗑️ 모든 채팅 이력 삭제 완료 (${roomCount}개 방)`);
  }

  clearChatHistory(group: string, club: string): void {
    const historyKey = `club_${club}`;
    const existed = this.chatHistories.has(historyKey);
    this.chatHistories.delete(historyKey);
    console.log(`🗑️ 채팅 이력 삭제:`, historyKey, existed ? '성공' : '존재하지 않음');
  }

  getAllChatRooms(): string[] {
    const rooms = Array.from(this.chatHistories.keys());
    console.log('📋 전체 채팅방 목록:', rooms);
    return rooms;
  }

  getChatMessageCount(group: string, club: string): number {
    const history = this.getChatHistory(group, club);
    const count = history ? history.messages.length : 0;
    console.log(`📊 메시지 개수 조회: ${group}/${club} = ${count}개`);
    return count;
  }

  getCurrentClubId(): number {
    console.log('🆔 현재 Club ID 조회:', this.currentClubId);
    return this.currentClubId;
  }

  getCurrentUser(): { email: string; username: string } {
    const user = {
      email: this.currentUserEmail,
      username: this.currentUsername
    };
    console.log('👤 현재 사용자 조회:', user);
    return user;
  }
}