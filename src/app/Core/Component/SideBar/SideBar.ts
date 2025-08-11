import { Component, OnInit, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { CommonModule } from "@angular/common";
import { SharedStateService } from "../../Service/SharedService";
import { Router } from "@angular/router";
import { UserService } from "../../Service/UserService";

export interface ChannelSelectEvent {
    groupId: string;
    channelId: string;
    channelName?: string;
    clubId?: number;
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
    }

    async ngOnInit(): Promise<void> {
        try {
            this.userJoin = await this.userService.getUserJoin();
        } catch (error) {
            console.error('Error loading user join list:', error);
        }
    }

    // === Tab Actions ===
    setActiveTab(tab: string): void {
        this.navigationChange.emit(tab);
        
        if (tab === 'group') {
            this.sharedState.setSidebarExpanded(true);
            this.sharedState.setSelectedChannel(null);
        } else {
            this.sharedState.setSidebarExpanded(false);
        }

        // 기부 탭 선택 시 특별 처리
        if (tab === 'donation') {
            console.log('🎯 기부 페이지로 이동');
            // 필요시 추가 로직 (예: 활동 추적)
            this.trackDonationPageVisit();
        }
    }

    // === 새로 추가된 기부 관련 메서드들 ===
    
    /**
     * 기부 페이지로 이동 (그룹바의 액션 버튼에서 호출)
     */
    goToDonation(): void {
        console.log('🎯 기부 페이지로 이동 (액션 버튼)');
        this.setActiveTab('donation');
        this.trackDonationPageVisit();
    }

    /**
     * 기부 페이지 방문 추적
     */
    private trackDonationPageVisit(): void {
        // LocalActivityService가 있다면 활동 추적
        try {
            // 실제 구현에서는 LocalActivityService 주입 후 사용
            console.log('📊 기부 페이지 방문 활동 기록');
            // this.activityService.trackActivity(
            //     'page_visit',
            //     '기부 페이지 방문',
            //     '기부 페이지를 방문하여 나눔을 실천하려고 합니다.'
            // );
        } catch (error) {
            console.error('활동 추적 실패:', error);
        }
    }

    // === 기존 메서드들 (변경 없음) ===
    
    toggle(): void {
        if (this.sharedState.activeTab() === 'group') {
            this.sharedState.toggleSidebar();
        }
    }

    toggleSection(sectionId: string): void {
        this.sharedState.toggleSection(sectionId);
        
        if (this.sharedState.selectedGroup() === sectionId) {
            this.groupSelect.emit(sectionId);
        }
    }

    async selectChannel(channel: any): Promise<void> {
        // 기존 채널 선택 로직 유지
        let clubId: number = -1;
        let channelName: string = '';
        
        try {
            if (typeof channel === 'string') {
                channelName = channel;
                clubId = await this.findClubIdByName(channel);
            } else if (channel && typeof channel === 'object') {
                channelName = channel.name || '';
                clubId = channel.clubId || channel.id || -1;
                
                if (clubId === -1 || typeof clubId !== 'number') {
                    console.warn('⚠️ 객체에서 유효한 clubId를 찾을 수 없음, 이름으로 재검색');
                    clubId = await this.findClubIdByName(channelName);
                }
            } else {
                console.error('❌ 잘못된 채널 객체 타입:', { channel, type: typeof channel });
                return;
            }
        } catch (error) {
            console.error('❌ 채널 정보 추출 중 오류:', error);
            return;
        }

        if (!channelName) {
            console.error('❌ 채널 이름이 없음');
            return;
        }
        
        if (clubId === -1 || typeof clubId !== 'number') {
            console.error('❌ 유효한 clubId를 찾을 수 없음:', { channelName, clubId });
            clubId = await this.findClubIdByNameFallback(channelName);
            
            if (clubId === -1) {
                console.error('❌ 모든 방법으로 clubId 찾기 실패');
            }
        }

        const currentGroup = await this.getCurrentGroupForChannel(channelName);
        if (!currentGroup) {
            console.error('❌ 채널에 대한 그룹을 찾을 수 없음:', channelName);
            return;
        }

        try {
            this.sharedState.setSelectedChannel(channelName, currentGroup, channelName);
        } catch (error) {
            console.error('❌ SharedService 채널 설정 실패:', error);
        }
        
        const eventData: ChannelSelectEvent = {
            groupId: currentGroup,
            channelId: channelName,
            channelName: channelName,
            clubId: clubId > 0 ? clubId : undefined
        };
        
        try {
            this.channelSelect.emit(eventData);
        } catch (error) {
            console.error('❌ 채널 선택 이벤트 전송 실패:', error);
        }

        this.validateChannelSelection(channelName, clubId, currentGroup);
    }

    private async findClubIdByName(channelName: string): Promise<number> {
        if (!this.userJoin) {
            this.userJoin = await this.userService.getUserJoin();
        }

        if (!this.userJoin) {
            console.error('❌ UserJoin 데이터를 로드할 수 없음');
            return -1;
        }

        for (const group of this.userJoin.joinList) {
            for (const club of group.clubList) {
                if (club.name === channelName) {
                    return club.clubId;
                }
            }
        }

        console.warn('⚠️ 클럽 ID를 찾을 수 없음:', channelName);
        return -1;
    }

    private async findClubIdByNameFallback(channelName: string): Promise<number> {
        try {
            const allClubs = this.sharedState.clubList();
            for (const club of allClubs) {
                if (club.name === channelName) {
                    return club.id;
                }
            }
            
            await this.refreshUserJoin();
            
            if (this.userJoin) {
                for (const group of this.userJoin.joinList) {
                    for (const club of group.clubList) {
                        if (club.name === channelName) {
                            return club.clubId;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Fallback 검색 중 오류:', error);
        }
        
        console.error('❌ 모든 Fallback 방법 실패');
        return -1;
    }

    private validateChannelSelection(channelName: string, clubId: number, groupName: string): void {
        const validations = {
            hasChannelName: !!channelName,
            hasValidClubId: clubId > 0,
            hasGroupName: !!groupName,
            sharedStateGroup: this.sharedState.selectedGroup() === groupName,
            sharedStateChannel: this.sharedState.selectedChannel() === channelName
        };
        
        const allValid = Object.values(validations).every(v => v);
        
        if (allValid) {
            console.log('✅ 모든 검증 통과');
        } else {
            console.warn('⚠️ 일부 검증 실패:', validations);
        }
        
        const currentChannelInfo = this.sharedState.currentChannelWithId();
    }

    debugChannelSelection(channel: any): void {
        console.log('🔍 ===== 채널 선택 디버그 =====');
        console.log('📋 선택된 채널 객체:', channel);
        console.log('📋 UserJoin 데이터:', this.userJoin);
        console.log('📋 SharedService 상태:', {
            selectedGroup: this.sharedState.selectedGroup(),
            selectedChannel: this.sharedState.selectedChannel(),
            currentChannelWithId: this.sharedState.currentChannelWithId(),
            groupList: this.sharedState.groupList(),
            clubList: this.sharedState.clubList()
        });
        
        if (channel?.name) {
            const found = this.userJoin?.joinList?.some((group: any) =>
                group.clubList?.some((club: any) => club.name === channel.name)
            );
            console.log('📋 채널 존재 여부:', found);
        }
        
        console.log('🔍 ===== 디버그 완료 =====');
    }

    async forceChannelReselection(channelName: string): Promise<void> {
        console.log('🔄 채널 강제 재선택:', channelName);
        
        this.sharedState.setSelectedChannel(null);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const channel = { name: channelName };
        await this.selectChannel(channel);
    }

    private async getCurrentGroupForChannel(channelName: string): Promise<string | null> {
        if (!this.userJoin) {
            this.userJoin = await this.userService.getUserJoin();
        }

        if (!this.userJoin) return null;

        for (const join of this.userJoin.joinList) {
            if (join.clubList.some((club: any) => {
                if (typeof club === 'string') {
                    return club === channelName;
                } else if (club && typeof club === 'object' && club.name) {
                    return club.name === channelName;
                }
                return false;
            })) {
                return join.groupname;
            }
        }
        
        console.log('❌ 채널이 어떤 그룹에도 속하지 않음:', channelName);
        return null;
    }

    // === Utility Actions ===
    browseChannels(): void {
        console.log('Browsing channels...');
        this.router.navigate(['group/join']);
    }

    async refreshUserJoin(): Promise<void> {
        try {
            this.userJoin = await this.userService.getUserJoin();
            console.log('User join list refreshed:', this.userJoin);
        } catch (error) {
            console.error('Error refreshing user join list:', error);
        }
    }

    // === State Helpers ===
    isActiveTab(tab: string): boolean {
        return this.sharedState.isActiveTab(tab);
    }

    isActiveGroup(groupId: string): boolean {
        return this.sharedState.isActiveGroup(groupId);
    }

    isActiveChannel(channelId: string): boolean {
        return this.sharedState.isActiveChannel(channelId);
    }

    isGroupBarShown(): boolean {
        return this.sharedState.sidebarExpanded() && this.sharedState.activeTab() === 'group';
    }

    isMenuBarShown(): boolean {
        return true;
    }

    isSectionExpanded(sectionId: string): boolean {
        return this.sharedState.isSectionExpanded(sectionId);
    }

    isGroupTabActive(): boolean {
        return this.sharedState.activeTab() === 'group';
    }

    getChannelName(channel: any): string {
        if (typeof channel === 'string') {
            return channel;
        } else if (channel && typeof channel === 'object' && channel.name) {
            return channel.name;
        }
        return 'Unknown Channel';
    }

    // === 기부 관련 헬퍼 메서드들 ===
    
    /**
     * 기부 탭이 활성화되어 있는지 확인
     */
    isDonationTabActive(): boolean {
        return this.sharedState.activeTab() === 'donation';
    }

    /**
     * 사용자가 기부 페이지에 접근할 수 있는지 확인
     * (예: 최소 포인트 보유, 인증된 사용자 등)
     */
    canAccessDonation(): boolean {
        // 기본적으로는 모든 사용자에게 허용
        // 필요시 조건 추가 (예: 최소 활동, 포인트 등)
        return true;
    }

    /**
     * 기부 페이지 접근 시 알림 표시 (선택사항)
     */
    showDonationWelcome(): void {
        console.log('💝 기부를 통해 더 나은 세상을 만들어보세요!');
        // 실제 구현에서는 토스트 메시지나 모달 등 사용 가능
    }
}