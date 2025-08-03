// SideBar.ts
import { Component, OnInit, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { CommonModule } from "@angular/common";
import { SharedStateService } from "../../Service/SharedService";
import { Router } from "@angular/router";
import { UserService } from "../../Service/UserService";
import { UserJoinList } from "../../Models/user";

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
    channelSelect = output<{ groupId: string, channelId: string }>();
    userJoinList: UserJoinList | undefined;

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
            this.userJoinList = await this.userService.getUserJoinList();
            console.log('User join list loaded:', this.userJoinList);
        } catch (error) {
            console.error('Error loading user join list:', error);
        }
    }

    // === Tab Actions ===
    setActiveTab(tab: string): void {
        this.navigationChange.emit(tab); // 부모에게 알림
        
        if (tab === 'group') {
            this.sharedState.setSidebarExpanded(true);
        } else {
            this.sharedState.setSidebarExpanded(false);
        }
    }

    // === Sidebar Toggle ===
    toggle(): void {
        this.sharedState.toggleSidebar();
    }

    // === Section Toggle ===
    toggleSection(sectionId: string): void {
        this.sharedState.toggleSection(sectionId);
        
        // 부모에게 그룹 선택 알림
        if (this.sharedState.selectedGroup() === sectionId) {
            this.groupSelect.emit(sectionId);
        }
    }

    // === Channel Selection ===
    async selectChannel(channelId: string): Promise<void> {
        // 현재 선택된 그룹 찾기
        const currentGroup = await this.getCurrentGroupForChannel(channelId);
        if (currentGroup) {
            // 부모에게 채널 선택 알림
            this.channelSelect.emit({ 
                groupId: currentGroup, 
                channelId: channelId 
            });
        }
    }

    private async getCurrentGroupForChannel(channelId: string): Promise<string | null> {
        // 이미 로드된 userJoinList가 없다면 다시 로드
        if (!this.userJoinList) {
            this.userJoinList = await this.userService.getUserJoinList();
        }

        // UserJoinList 인터페이스에 맞게 수정
        if (!this.userJoinList) return null;

        // 채널 ID를 기반으로 어느 그룹에 속하는지 판단
        for (const join of this.userJoinList.joinList) {
            if (join.clubList.includes(channelId)) {
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
    async refreshUserJoinList(): Promise<void> {
        try {
            this.userJoinList = await this.userService.getUserJoinList();
            console.log('User join list refreshed:', this.userJoinList);
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

    isSidebarShown(): boolean {
        return this.sharedState.sidebarExpanded();
    }

    isSectionExpanded(sectionId: string): boolean {
        return this.sharedState.isSectionExpanded(sectionId);
    }
}