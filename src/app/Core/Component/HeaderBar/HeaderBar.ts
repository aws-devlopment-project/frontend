// HeaderBar.ts
import { Component, input, output } from "@angular/core";
import { SearchBarComponent } from "../SearchBar/SearchBar";
import { MatIconModule } from "@angular/material/icon";
import { CommonModule } from "@angular/common";
import { SharedStateService } from "../../Service/SharedService";

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  type: 'group' | 'club';
  icon?: string;
  groupName?: string;
}

@Component({
    selector: 'app-header',
    templateUrl: './HeaderBar.html',
    styleUrl: './HeaderBar.css',
    imports: [SearchBarComponent, MatIconModule, CommonModule],
    standalone: true
})
export class HeaderBarComponent {
    // 입력 프로퍼티
    showSearch = input<boolean>(true);
    currentPage = input<string>('');
    
    // 출력 이벤트
    searchQuery = output<string>();

    constructor(public sharedState: SharedStateService) {
        console.log('HeaderBarComponent initialized with SharedStateService');
    }

    onSearchQuery(query: string): void {
        console.log('Search query received:', query, typeof query);
        this.searchQuery.emit(query);
    }

    onSearchQueryResultSelected(result: SearchResult): void {
        console.log('Search result selected:', result);
    }

    // SearchBar에서 직접 호출되는 이벤트 핸들러
    onChannelSelected(selection: { groupName: string, channelName: string }): void {
        this.navigateToChannel(selection.groupName, selection.channelName);
    }

    // 네비게이션 메서드들
    navigateToGroup(groupName: string): void {
        // 1. 그룹 탭으로 변경
        this.sharedState.setActiveTab('group');
        
        // 2. 사이드바 확장
        this.sharedState.setSidebarExpanded(true);
        
        // 3. 해당 그룹 선택
        this.sharedState.setSelectedGroup(groupName);
        
        // 4. 채널 선택 초기화 (그룹 레벨에서 머물기)
        this.sharedState.setSelectedChannel(null);
        
        // 5. 해당 그룹 섹션이 접혀있다면 확장
        if (!this.sharedState.isSectionExpanded(groupName)) {
            this.sharedState.toggleSection(groupName);
        }
    }

    navigateToChannel(groupName: string, channelName: string): void {
        console.log('Navigating to channel from search:', { groupName, channelName });
        
        // 1. 그룹 탭으로 변경
        this.sharedState.setActiveTab('group');
        
        // 2. 사이드바 확장
        this.sharedState.setSidebarExpanded(true);
        
        // 3. 해당 그룹 섹션이 접혀있다면 확장
        if (!this.sharedState.isSectionExpanded(groupName)) {
            this.sharedState.toggleSection(groupName);
        }
        
        // 4. 그룹 및 채널 선택
        this.sharedState.setSelectedGroup(groupName);
        this.sharedState.setSelectedChannel(channelName, groupName);
    }

    // Service 기반 헬퍼 메서드들
    getCurrentPageDisplay(): string {
        // input으로 받은 currentPage가 있으면 사용, 없으면 service에서 가져오기
        return this.currentPage() || this.sharedState.currentPageTitle();
    }

    getCurrentUser() {
        return this.sharedState.currentUser();
    }

    isLoading(): boolean {
        return this.sharedState.isLoading();
    }
    
    usePassiveActivateGroupTabForMobile(): void {
        this.sharedState.setSidebarExpanded(!this.sharedState.sidebarExpanded());
    }

    isActivateGroup(): boolean {
        if (this.sharedState.activeTab() === 'group')
            return true;
        return false;
    }

    getSidebarToggleIcon(): string {
        return this.sharedState.sidebarExpanded() ? 'close_fullscreen' : 'open_in_full';
    }
}