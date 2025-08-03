// Models/chatMessage.ts - WebSocket 지원 업데이트
export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'file' | 'system' | 'user_joined' | 'user_left' | 'error';
  channelId?: string;
  
  // 확장 기능을 위한 옵션 필드들
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  reactions?: MessageReaction[];
  replyTo?: string; // 답장하는 메시지 ID
  mentions?: string[]; // 멘션된 사용자 ID 목록
  edited?: boolean;
  editedAt?: Date;
}

export interface MessageReaction {
  emoji: string;
  users: string[]; // 리액션한 사용자 ID 목록
  count: number;
}

export interface ChannelInfo {
  id: string;
  name: string;
  description: string;
  type: 'public' | 'private' | 'direct';
  memberCount?: number;
  lastActivity?: Date;
  unreadCount?: number;
  isArchived?: boolean;
}

export interface UserPresence {
  userId: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen?: Date;
  currentChannel?: string;
}

// WebSocket 메시지 타입 정의
export interface WSMessagePayload {
  type: 'chat_message' | 'user_presence' | 'typing_start' | 'typing_stop' | 
        'channel_join' | 'channel_leave' | 'message_reaction' | 'message_edit' | 
        'message_delete' | 'file_upload' | 'user_mention';
  data: any;
  channelId?: string;
  userId?: string;
  timestamp: Date;
}

// 파일 업로드 관련
export interface FileUpload {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  thumbnailUrl?: string;
  uploadProgress?: number;
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed';
}