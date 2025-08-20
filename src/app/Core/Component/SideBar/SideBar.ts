import { Component, OnInit, OnDestroy, output, effect } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { CommonModule } from "@angular/common";
import { SharedStateService } from "../../Service/SharedService";
import { Router } from "@angular/router";
import { UserService } from "../../Service/UserService";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";

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
export class SideBarComponent implements OnInit, OnDestroy {
    navigationChange = output<string>();
    groupSelect = output<string>();
    channelSelect = output<ChannelSelectEvent>(); 
    
    userJoin: any;
    private destroy$ = new Subject<void>();
    private refreshTimer: any;

    constructor(
        public sharedState: SharedStateService, 
        private userService: UserService, 
        private router: Router
    ) {
        // SharedStateService의 userJoin 변화를 실시간으로 감지
        effect(() => {
            const sharedUserJoin = this.sharedState.userJoin();
            if (sharedUserJoin) {
                console.log('🔄 SideBar: SharedState에서 userJoin 업데이트 감지');
                this.userJoin = sharedUserJoin;
            }
        });

        // 에러 상태 감지
        effect(() => {
            const error = this.sharedState.error();
            if (error) {
                console.warn('⚠️ SideBar: SharedState 에러 감지:', error);
            }
        });
    }

    async ngOnInit(): Promise<void> {
        try {
            // 초기 데이터 로드
            await this.loadInitialData();
            
            // 주기적 데이터 검증 설정 (선택사항)
            this.setupPeriodicValidation();
            
        } catch (error) {
            console.error('❌ SideBar 초기화 실패:', error);
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
    }

    // === 실시간 데이터 동기화 개선 메서드들 ===

    /**
     * 초기 데이터 로드 - SharedStateService를 우선으로 사용
     */
    private async loadInitialData(): Promise<void> {
        console.log('📊 SideBar 초기 데이터 로드 시작...');
        
        // SharedStateService에서 먼저 확인
        const sharedUserJoin = this.sharedState.userJoin();
        
        if (sharedUserJoin && sharedUserJoin.joinList) {
            console.log('✅ SharedState에서 데이터 로드 성공');
            this.userJoin = sharedUserJoin;
        } else {
            console.log('📡 SharedState에 데이터 없음, UserService에서 직접 로드');
            try {
                this.userJoin = await this.userService.getUserJoin();
                console.log('✅ UserService에서 데이터 로드 성공');
            } catch (error) {
                console.error('❌ UserService 데이터 로드 실패:', error);
            }
        }
    }

    /**
     * 주기적 데이터 유효성 검증 (선택사항 - 필요시 활성화)
     */
    private setupPeriodicValidation(): void {
        // 개발 환경에서만 활성화하거나, 필요시 주석 해제
        /*
        this.refreshTimer = setInterval(() => {
            this.validateDataConsistency();
        }, 30000); // 30초마다 검증
        */
    }

    /**
     * SharedStateService와 로컬 데이터의 일관성 검증
     */
    private validateDataConsistency(): void {
        const sharedUserJoin = this.sharedState.userJoin();
        const localGroupCount = this.userJoin?.joinList?.length || 0;
        const sharedGroupCount = sharedUserJoin?.joinList?.length || 0;

        if (localGroupCount !== sharedGroupCount) {
            console.log('🔄 데이터 불일치 감지, 동기화 실행:', {
                로컬: localGroupCount,
                공유상태: sharedGroupCount
            });
            
            if (sharedUserJoin) {
                this.userJoin = sharedUserJoin;
            }
        }
    }

    /**
     * 강제 데이터 새로고침 (회원 관리에서 변경 후 호출용)
     */
    async forceRefreshSidebarData(): Promise<void> {
        console.log('🔄 SideBar 강제 데이터 새로고침 시작...');
        
        try {
            // 1. SharedStateService 강제 새로고침
            await this.sharedState.forceRefreshUserJoin();
            
            // 2. 로컬 데이터 업데이트
            const updatedUserJoin = this.sharedState.userJoin();
            if (updatedUserJoin) {
                this.userJoin = updatedUserJoin;
                console.log('✅ SideBar 데이터 새로고침 완료');
            }
            
        } catch (error) {
            console.error('❌ SideBar 데이터 새로고침 실패:', error);
        }
    }

    // === 개선된 채널 선택 메서드 ===
    
    async selectChannel(channel: any): Promise<void> {
        console.log('🎯 SideBar: 채널 선택 시작:', channel);
        
        // 데이터 일관성 먼저 확인
        await this.ensureDataConsistency();
        
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
        
        // 채널이 여전히 유효한지 확인
        const isChannelValid = await this.validateChannelExists(channelName);
        if (!isChannelValid) {
            console.error('❌ 선택하려는 채널이 더 이상 존재하지 않음:', channelName);
            this.showChannelNotFoundMessage(channelName);
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

    /**
     * 채널이 현재 사용자의 가입 목록에 여전히 존재하는지 확인
     */
    private async validateChannelExists(channelName: string): Promise<boolean> {
        await this.ensureDataConsistency();
        
        if (!this.userJoin?.joinList) {
            return false;
        }

        for (const group of this.userJoin.joinList) {
            const hasChannel = group.clubList.some((club: any) => {
                const clubName = typeof club === 'string' ? club : club.name;
                return clubName === channelName;
            });
            
            if (hasChannel) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 데이터 일관성 보장
     */
    private async ensureDataConsistency(): Promise<void> {
        const sharedUserJoin = this.sharedState.userJoin();
        
        // SharedState가 더 최신이면 동기화
        if (sharedUserJoin && (!this.userJoin || 
            sharedUserJoin.joinList?.length !== this.userJoin.joinList?.length)) {
            console.log('🔄 데이터 일관성을 위해 동기화 실행');
            this.userJoin = sharedUserJoin;
        }
        
        // SharedState도 없고 로컬 데이터도 없으면 새로 로드
        if (!sharedUserJoin && !this.userJoin) {
            console.log('📡 데이터 없음, 새로 로드');
            await this.refreshUserJoin();
        }
    }

    /**
     * 채널을 찾을 수 없을 때 사용자에게 알림
     */
    private showChannelNotFoundMessage(channelName: string): void {
        console.warn(`⚠️ 채널 "${channelName}"을(를) 찾을 수 없습니다. 이미 탈퇴했을 수 있습니다.`);
        // 실제 구현에서는 토스트 메시지나 알림 표시
        // this.notificationService.showWarning(`채널 "${channelName}"을(를) 찾을 수 없습니다.`);
    }

    // === 기존 메서드들 (개선됨) ===
    
    setActiveTab(tab: string): void {
        this.navigationChange.emit(tab);
        
        if (tab === 'group') {
            this.sharedState.setSidebarExpanded(true);
            this.sharedState.setSelectedChannel(null);
        } else {
            this.sharedState.setSidebarExpanded(false);
        }

        if (tab === 'donation') {
            console.log('🎯 기부 페이지로 이동');
            this.trackDonationPageVisit();
        }
    }

    goToDonation(): void {
        console.log('🎯 기부 페이지로 이동 (액션 버튼)');
        this.setActiveTab('donation');
        this.trackDonationPageVisit();
    }

    private trackDonationPageVisit(): void {
        try {
            console.log('📊 기부 페이지 방문 활동 기록');
        } catch (error) {
            console.error('활동 추적 실패:', error);
        }
    }

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

    // === 유틸리티 메서드들 (기존과 동일) ===
    
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

    isDonationTabActive(): boolean {
        return this.sharedState.activeTab() === 'donation';
    }

    canAccessDonation(): boolean {
        return true;
    }

    showDonationWelcome(): void {
        console.log('💝 기부를 통해 더 나은 세상을 만들어보세요!');
    }
}