// SideBar.ts - clubId를 올바르게 전달하도록 개선
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
    clubId?: number; // 실제 clubId 추가
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
        this.navigationChange.emit(tab);
        
        if (tab === 'group') {
            this.sharedState.setSidebarExpanded(true);
            this.sharedState.setSelectedChannel(null);
        } else {
            this.sharedState.setSidebarExpanded(false);
        }
    }

    // === Sidebar Toggle ===
    toggle(): void {
        if (this.sharedState.activeTab() === 'group') {
            this.sharedState.toggleSidebar();
        }
    }

    // === Section Toggle ===
    toggleSection(sectionId: string): void {
        console.log('Toggling section:', sectionId);
        this.sharedState.toggleSection(sectionId);
        
        if (this.sharedState.selectedGroup() === sectionId) {
            this.groupSelect.emit(sectionId);
        }
    }

    // === 개선된 채널 선택 로직 ===
    async selectChannel(channel: any): Promise<void> {
        console.log('🎯 ===== 채널 선택 시작 =====');
        console.log('📋 입력 채널 객체:', {
            channel,
            type: typeof channel,
            isString: typeof channel === 'string',
            isObject: typeof channel === 'object',
            hasName: channel?.name,
            hasClubId: channel?.clubId,
            hasId: channel?.id
        });
        
        // 1. 채널 객체에서 정보 추출
        let clubId: number = -1;
        let channelName: string = '';
        
        try {
            if (typeof channel === 'string') {
                // 문자열인 경우 (이전 버전 호환성)
                channelName = channel;
                clubId = await this.findClubIdByName(channel);
                console.log('📝 문자열 채널 처리:', { channelName, clubId });
                
            } else if (channel && typeof channel === 'object') {
                // Club 객체인 경우
                channelName = channel.name || '';
                clubId = channel.clubId || channel.id || -1;
                
                console.log('📝 객체 채널 처리:', {
                    channelName,
                    clubId,
                    originalClubId: channel.clubId,
                    originalId: channel.id,
                    finalClubId: clubId
                });
                
                // clubId 검증
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

        // 2. 추출된 정보 검증
        if (!channelName) {
            console.error('❌ 채널 이름이 없음');
            return;
        }
        
        if (clubId === -1 || typeof clubId !== 'number') {
            console.error('❌ 유효한 clubId를 찾을 수 없음:', { channelName, clubId });
            
            // 마지막 시도: UserJoin에서 직접 검색
            console.log('🔄 UserJoin에서 다시 검색 시도...');
            clubId = await this.findClubIdByNameFallback(channelName);
            
            if (clubId === -1) {
                console.error('❌ 모든 방법으로 clubId 찾기 실패');
                // 그래도 진행 (MainContainer에서 에러 처리)
            }
        }

        console.log('✅ 채널 정보 추출 완료:', { channelName, clubId });

        // 3. 현재 선택된 그룹 찾기
        const currentGroup = await this.getCurrentGroupForChannel(channelName);
        if (!currentGroup) {
            console.error('❌ 채널에 대한 그룹을 찾을 수 없음:', channelName);
            return;
        }

        console.log('✅ 그룹 찾기 완료:', currentGroup);

        // 4. SharedService에 채널 설정
        try {
            this.sharedState.setSelectedChannel(channelName, currentGroup, channelName);
            console.log('✅ SharedService 채널 설정 완료');
        } catch (error) {
            console.error('❌ SharedService 채널 설정 실패:', error);
        }
        
        // 5. 부모 컴포넌트에 이벤트 전송
        const eventData: ChannelSelectEvent = {
            groupId: currentGroup,
            channelId: channelName,
            channelName: channelName,
            clubId: clubId > 0 ? clubId : undefined // -1인 경우 undefined로 전송
        };

        console.log('📤 부모에게 이벤트 전송:', eventData);
        
        try {
            this.channelSelect.emit(eventData);
            console.log('✅ 이벤트 전송 완료');
        } catch (error) {
            console.error('❌ 이벤트 전송 실패:', error);
        }

        // 6. 검증
        this.validateChannelSelection(channelName, clubId, currentGroup);
        
        console.log('🎯 ===== 채널 선택 완료 =====');
    }

    private async findClubIdByName(channelName: string): Promise<number> {
        console.log('🔍 클럽 ID 검색 시작:', channelName);
        
        if (!this.userJoin) {
            console.log('UserJoin 없음, 로드 시도...');
            this.userJoin = await this.userService.getUserJoin();
        }

        if (!this.userJoin) {
            console.error('❌ UserJoin 데이터를 로드할 수 없음');
            return -1;
        }

        // 모든 그룹의 클럽 리스트에서 검색
        for (const group of this.userJoin.joinList) {
            console.log(`🔍 그룹 "${group.groupname}"에서 검색 중...`);
            
            for (const club of group.clubList) {
                console.log(`  - 클럽 확인: ${club.name} (ID: ${club.clubId})`);
                
                if (club.name === channelName) {
                    console.log('✅ 클럽 ID 찾음:', { channelName, clubId: club.clubId, groupName: group.groupname });
                    return club.clubId;
                }
            }
        }

        console.warn('⚠️ 클럽 ID를 찾을 수 없음:', channelName);
        return -1;
    }

    // Fallback 메서드: 다른 방법으로 clubId 찾기
    private async findClubIdByNameFallback(channelName: string): Promise<number> {
        console.log('🔄 Fallback 방법으로 클럽 ID 검색:', channelName);
        
        try {
            // SharedService의 clubList에서 직접 검색
            const allClubs = this.sharedState.clubList();
            console.log('SharedService 클럽 목록에서 검색:', allClubs.length, '개 클럽');
            
            for (const club of allClubs) {
                if (club.name === channelName) {
                    console.log('✅ SharedService에서 클럽 ID 찾음:', { channelName, clubId: club.id });
                    return club.id;
                }
            }
            
            console.log('SharedService에서도 찾을 수 없음');
            
            // 마지막 시도: UserJoin 새로고침 후 재검색
            console.log('🔄 UserJoin 새로고침 후 재시도...');
            await this.refreshUserJoin();
            
            if (this.userJoin) {
                for (const group of this.userJoin.joinList) {
                    for (const club of group.clubList) {
                        if (club.name === channelName) {
                            console.log('✅ 새로고침 후 클럽 ID 찾음:', { channelName, clubId: club.clubId });
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

    // === 검증 메서드 ===

    private validateChannelSelection(channelName: string, clubId: number, groupName: string): void {
        console.log('🔍 채널 선택 검증 시작');
        
        const validations = {
            hasChannelName: !!channelName,
            hasValidClubId: clubId > 0,
            hasGroupName: !!groupName,
            sharedStateGroup: this.sharedState.selectedGroup() === groupName,
            sharedStateChannel: this.sharedState.selectedChannel() === channelName
        };
        
        console.log('📊 검증 결과:', validations);
        
        const allValid = Object.values(validations).every(v => v);
        
        if (allValid) {
            console.log('✅ 모든 검증 통과');
        } else {
            console.warn('⚠️ 일부 검증 실패:', validations);
        }
        
        // SharedService 상태도 확인
        const currentChannelInfo = this.sharedState.currentChannelWithId();
        console.log('📊 SharedService 현재 채널 정보:', currentChannelInfo);
    }

    // === 디버깅 메서드 개선 ===

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
        
        // 채널이 실제로 존재하는지 확인
        if (channel?.name) {
            const found = this.userJoin?.joinList?.some((group: any) =>
                group.clubList?.some((club: any) => club.name === channel.name)
            );
            console.log('📋 채널 존재 여부:', found);
        }
        
        console.log('🔍 ===== 디버그 완료 =====');
    }

    // 수동으로 채널 재선택 (디버깅용)
    async forceChannelReselection(channelName: string): Promise<void> {
        console.log('🔄 채널 강제 재선택:', channelName);
        
        // 현재 상태 초기화
        this.sharedState.setSelectedChannel(null);
        
        // 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 다시 선택
        const channel = { name: channelName };
        await this.selectChannel(channel);
    }

    // === 기존 메서드들 (수정 없음) ===
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
}