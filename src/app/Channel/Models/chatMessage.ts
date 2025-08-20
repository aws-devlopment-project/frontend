export interface SimpleChatMessage {
  chatRoomId: string;
  senderId: string;
  senderUsername: string;
  type: 'user' | 'system';
  event: 'chat' | 'load' | 'image' | 'check';
  messages: string;
  timestamp: Date;
}

export interface ChatMessageDto {
  clubId: number;          // 채팅방 ID (숫자)
  senderEmail: string;     // 발신자 이메일
  senderUsername: string;  // 발신자 이름
  message: string;         // 메시지 내용 (백엔드 예시에 맞춤)
  type: 'CHAT' | 'JOIN' | 'LEAVE' | 'IMAGE';  // 메시지 타입
  timestamp?: number;      // 타임스탬프 (프론트에서 추가)
}

export interface ChatHistory {
  group: string;
  club: string;
  messages: {
    senderEmail: string;
    senderUsername: string;
    type: 'CHAT' | 'JOIN' | 'LEAVE' | 'IMAGE';
    message: string;
    timestamp: number;
  }[];
}