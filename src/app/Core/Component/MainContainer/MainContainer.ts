import { Component, ElementRef, ViewChild, signal, OnInit } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

interface Message {
    id: string;
    author: string;
    text: string;
    timestamp: Date;
    avatar?: string;
}

@Component({
    selector: 'app-main-container',
    templateUrl: './MainContainer.html',
    styleUrl: './MainContainer.css',
    imports: [MatIconModule],
    standalone: true
})
export class MainContainerComponent implements OnInit {
    @ViewChild('messagesContainer') messagesContainer!: ElementRef;
    @ViewChild('messageInput') messageInput!: ElementRef;

    currentChannel = signal('general');
    newMessage = signal('');
    messages = signal<Message[]>([]);
    memberCount = signal(42);
    hoveredMessageId = signal<string | null>(null);

    ngOnInit(): void {
        // 샘플 메시지 로드
        this.loadSampleMessages();
    }

    private loadSampleMessages(): void {
        const sampleMessages: Message[] = [
            {
                id: '1',
                author: '김철수',
                text: '안녕하세요! ENTJ 모임에 처음 참여합니다. 잘 부탁드려요! 😊',
                timestamp: new Date(Date.now() - 3600000) // 1시간 전
            },
            {
                id: '2',
                author: '이영희',
                text: '환영합니다! 여기서 효율적인 습관 관리 팁들을 많이 공유하고 있어요.',
                timestamp: new Date(Date.now() - 3000000) // 50분 전
            },
            {
                id: '3',
                author: '이영희',
                text: '특히 시간 관리와 목표 설정에 대한 노하우가 풍부합니다!',
                timestamp: new Date(Date.now() - 2900000) // 48분 전
            },
            {
                id: '4',
                author: '박민수',
                text: '오늘 하루 목표 달성했습니다! 💪 모두들 화이팅!',
                timestamp: new Date(Date.now() - 1800000) // 30분 전
            }
        ];
        this.messages.set(sampleMessages);
    }

    getChannelDescription(): string {
        const descriptions: { [key: string]: string } = {
            'entj': 'ENTJ 성격 유형의 사람들이 모여 효율적인 습관을 공유하는 채널',
            'estp': 'ESTP 성격 유형의 사람들이 모여 활동적인 습관을 공유하는 채널',
            'general': '일반적인 대화를 나누는 채널',
            'tips': '유용한 팁과 노하우를 공유하는 채널'
        };
        return descriptions[this.currentChannel()] || '채널 설명이 없습니다.';
    }

    isCompactMessage(message: Message, index: number): boolean {
        if (index === 0) return false;
        const previousMessage = this.messages()[index - 1];
        const timeDiff = message.timestamp.getTime() - previousMessage.timestamp.getTime();
        return previousMessage.author === message.author && timeDiff < 300000; // 5분 이내
    }

    getAvatarInitials(author: string): string {
        return author.split(' ').map(name => name[0]).join('').toUpperCase();
    }

    formatTimestamp(timestamp: Date): string {
        const now = new Date();
        const diff = now.getTime() - timestamp.getTime();
        
        if (diff < 60000) { // 1분 미만
            return '방금 전';
        } else if (diff < 3600000) { // 1시간 미만
            return `${Math.floor(diff / 60000)}분 전`;
        } else if (diff < 86400000) { // 24시간 미만
            return timestamp.toLocaleTimeString('ko-KR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } else {
            return timestamp.toLocaleDateString('ko-KR');
        }
    }

    onMessageInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement;
        this.newMessage.set(target.value);
        this.adjustTextareaHeight(event);
    }

    handleKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    adjustTextareaHeight(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }

    sendMessage(): void {
        const messageText = this.newMessage().trim();
        if (!messageText) return;

        const newMessage: Message = {
            id: Date.now().toString(),
            author: '나',
            text: messageText,
            timestamp: new Date()
        };

        this.messages.update(messages => [...messages, newMessage]);
        this.newMessage.set('');
        
        // 메시지 입력창 높이 리셋
        if (this.messageInput) {
            const textarea = this.messageInput.nativeElement;
            textarea.style.height = 'auto';
        }

        // 스크롤을 최하단으로
        setTimeout(() => this.scrollToBottom(), 100);
    }

    private scrollToBottom(): void {
        if (this.messagesContainer) {
            const container = this.messagesContainer.nativeElement;
            container.scrollTop = container.scrollHeight;
        }
    }

    showMessageActions(messageId: string): void {
        this.hoveredMessageId.set(messageId);
    }

    hideMessageActions(): void {
        this.hoveredMessageId.set(null);
    }

    // 메시지 액션 메서드들
    addReaction(messageId: string): void {
        console.log('Adding reaction to message:', messageId);
    }

    replyToMessage(messageId: string): void {
        console.log('Replying to message:', messageId);
    }

    shareMessage(messageId: string): void {
        console.log('Sharing message:', messageId);
    }

    showMessageOptions(messageId: string): void {
        console.log('Showing options for message:', messageId);
    }

    // 채널 액션 메서드들
    showChannelInfo(): void {
        console.log('Showing channel info');
    }

    showMembers(): void {
        console.log('Showing members');
    }

    searchInChannel(): void {
        console.log('Searching in channel');
    }

    showMoreOptions(): void {
        console.log('Showing more options');
    }

    // 입력 액션 메서드들
    attachFile(): void {
        console.log('Attaching file');
    }

    showEmojiPicker(): void {
        console.log('Showing emoji picker');
    }

    showMentions(): void {
        console.log('Showing mentions');
    }

    showFormatting(): void {
        console.log('Showing formatting options');
    }
}