// SideBar.ts - Fixed Channel Selection
import { Component, OnInit, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { CommonModule } from "@angular/common";
import { SharedStateService } from "../../Service/SharedService";
import { Router } from "@angular/router";
import { UserService } from "../../Service/UserService";

interface ChannelSelectEvent {
    groupId: string;
    channelId: string;
    channelName?: string;
}

@Component({
    selector: 'app-sidebar',
    templateUrl: './SideBar.html',
    styleUrl: './SideBar.css',
    imports: [MatIconModule, CommonModule],
    standalone: true
})
export class SideBarComponent implements OnInit {
    navigationChange = output<string>();
    groupSelect = output<string>();
    channelSelect = output<ChannelSelectEvent>(); 
    userJoin: any;

    constructor(
        public sharedState: SharedStateService, 
        private userService: UserService, 
        private router: Router
    ) {
        console.log('SideBarComponent initialized with SharedStateService');
    }

    async ngOnInit(): Promise<void> {
        try {
            // 컴포넌트 초기화 시 사용자 가입 목록 로드
            this.userJoin = await this.userService.getUserJoin();
            console.log('User join list loaded:', this.userJoin);
        } catch (error) {
            console.error('Error loading user join list:', error);
        }
    }

    // === Tab Actions ===
    setActiveTab(tab: string): void {
        this.navigationChange.emit(tab); // 부모에게 알림
        
        // 그룹 탭일 때만 그룹바를 표시
        if (tab === 'group') {
            this.sharedState.setSidebarExpanded(true);
            this.sharedState.setSelectedChannel(null);
        } else {
            // 다른 탭일 때는 그룹바만 숨김 (메뉴바는 유지)
            this.sharedState.setSidebarExpanded(false);
        }
    }

    // === Sidebar Toggle (그룹바만 토글) ===
    toggle(): void {
        // 그룹 탭에서만 그룹바 토글 허용
        if (this.sharedState.activeTab() === 'group') {
            this.sharedState.toggleSidebar();
        }
    }

    // === Section Toggle ===
    toggleSection(sectionId: string): void {
        console.log('Toggling section:', sectionId);
        this.sharedState.toggleSection(sectionId);
        
        // 부모에게 그룹 선택 알림
        if (this.sharedState.selectedGroup() === sectionId) {
            this.groupSelect.emit(sectionId);
        }
    }

    async selectChannel(channel: any): Promise<void> {
        console.log('Raw channel object received:', channel);
        
        // 채널 객체에서 실제 채널 ID(name) 추출
        let channelId: string;
        let channelName: string;
        
        if (typeof channel === 'string') {
            channelId = channel;
            channelName = channel;
        } else if (channel && typeof channel === 'object' && channel.name) {
            // Club 객체인 경우 name 속성을 사용
            channelId = channel.name;
            channelName = channel.name;
        } else {
            console.error('Invalid channel object:', channel);
            return;
        }
        
        console.log('Extracted channel info:', { channelId, channelName });
        
        // 현재 선택된 그룹 찾기
        const currentGroup = await this.getCurrentGroupForChannel(channelId);
        if (currentGroup) {
            console.log('Found group for channel:', { channelId, channelName, currentGroup });
            
            // 부모에게 채널 선택 알림 (채널 ID와 Name 모두 전달)
            this.channelSelect.emit({ 
                groupId: currentGroup, 
                channelId: channelId,
                channelName: channelName  // 추가
            });
        } else {
            console.warn('No group found for channel:', channelId);
        }
    }
    private async getCurrentGroupForChannel(channelId: string): Promise<string | null> {
        // 이미 로드된 userJoin가 없다면 다시 로드
        if (!this.userJoin) {
            this.userJoin = await this.userService.getUserJoin();
        }

        // UserJoin 인터페이스에 맞게 수정
        if (!this.userJoin) return null;

        // 채널 ID를 기반으로 어느 그룹에 속하는지 판단
        for (const join of this.userJoin.joinList) {
            // Club 객체의 name과 비교
            if (join.clubList.some((club: any) => {
                if (typeof club === 'string') {
                    return club === channelId;
                } else if (club && typeof club === 'object' && club.name) {
                    return club.name === channelId;
                }
                return false;
            })) {
                return join.groupname;
            }
        }
        
        console.log('Channel not found in any group:', channelId);
        return null;
    }

    // === Utility Actions ===
    browseChannels(): void {
        console.log('Browsing channels...');
        this.router.navigate(['group/join']);
    }

    // === Data Refresh ===
    async refreshUserJoin(): Promise<void> {
        try {
            this.userJoin = await this.userService.getUserJoin();
            console.log('User join list refreshed:', this.userJoin);
        } catch (error) {
            console.error('Error refreshing user join list:', error);
        }
    }

    // === State Helpers (Service 기반) ===
    isActiveTab(tab: string): boolean {
        return this.sharedState.isActiveTab(tab);
    }

    isActiveGroup(groupId: string): boolean {
        return this.sharedState.isActiveGroup(groupId);
    }

    isActiveChannel(channelId: string): boolean {
        return this.sharedState.isActiveChannel(channelId);
    }

    // 그룹바만 표시 여부 (메뉴바는 항상 표시)
    isGroupBarShown(): boolean {
        return this.sharedState.sidebarExpanded() && this.sharedState.activeTab() === 'group';
    }

    // 메뉴바는 항상 표시
    isMenuBarShown(): boolean {
        return true; // 항상 true
    }

    isSectionExpanded(sectionId: string): boolean {
        return this.sharedState.isSectionExpanded(sectionId);
    }

    // === 그룹 탭 여부 확인 ===
    isGroupTabActive(): boolean {
        return this.sharedState.activeTab() === 'group';
    }

    // === Helper method for getting channel name ===
    getChannelName(channel: any): string {
        if (typeof channel === 'string') {
            return channel;
        } else if (channel && typeof channel === 'object' && channel.name) {
            return channel.name;
        }
        return 'Unknown Channel';
    }
}