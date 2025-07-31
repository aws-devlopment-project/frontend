// SideBar.ts
import { Component, signal, input, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { CommonModule } from "@angular/common";

@Component({
    selector: 'app-sidebar',
    templateUrl: './Sidebar.html',
    styleUrl: './SideBar.css',
    imports: [MatIconModule, CommonModule],
    standalone: true
})
export class SideBarComponent {
    // 입력 프로퍼티
    activeTab = input<string>('challenge');
    
    // 출력 이벤트
    navigationChange = output<string>();
    
    // 내부 상태
    isShown = signal(false);
    expandedSections = signal<string[]>(['challenge']); // 기본적으로 0원 챌린지 섹션 열림
    selectedChannel = signal('general');

    toggle(): void {
        this.isShown.update((isShown) => !isShown);
    }

    setActiveTab(tab: string): void {
        // 부모 컴포넌트에 변경사항 전달
        this.navigationChange.emit(tab);
        
        if (tab === 'challenge') {
            this.isShown.set(true);
        } else {
            this.isShown.set(false);
        }
    }

    toggleSection(sectionId: string): void {
        this.expandedSections.update(sections => {
            if (sections.includes(sectionId)) {
                return sections.filter(id => id !== sectionId);
            } else {
                return [...sections, sectionId];
            }
        });
    }

    selectChannel(channelId: string): void {
        this.selectedChannel.set(channelId);
        console.log('Selected channel:', channelId);
    }

    addChannel(): void {
        console.log('Adding new channel...');
    }

    browseChannels(): void {
        console.log('Browsing channels...');
    }

    // 활성 탭 확인 헬퍼 메서드
    isActiveTab(tab: string): boolean {
        return this.activeTab() === tab;
    }
}