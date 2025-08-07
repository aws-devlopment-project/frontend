export interface SimpleChatMessage {
  chatRoomId: string;
  senderId: string;
  senderUsername: string;
  type: 'user' | 'system';
  event: 'chat' | 'load' | 'image' | 'check';
  messages: string;
  timestamp: Date;
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