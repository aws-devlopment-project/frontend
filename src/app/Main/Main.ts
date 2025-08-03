// Main.ts
import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SideBarComponent } from "../Core/Component/SideBar/SideBar";
import { HeaderBarComponent } from "../Core/Component/HeaderBar/HeaderBar";
import { GroupDashboardComponent } from "../DashBoard/Component/GroupDashboard/GroupDashboard";
import { HomeDashboardComponent } from "../DashBoard/Component/HomeDashboard/HomeDashboard";
import { MainContainerComponent } from "../Channel/Component/MainContainer/MainContainer";
import { MemberOptionsComponent } from "../DashBoard/Component/MemberDashboard/MemberDashboard";
import { ActivityDashboardComponent } from "../DashBoard/Component/ActivityDashboard/ActivityDashboard";
import { SharedStateService } from "../Core/Service/SharedService";

@Component({
  selector: 'app-main',
  templateUrl: './Main.html',
  styleUrl: './Main.css',
  imports: [
    CommonModule,
    SideBarComponent,
    HeaderBarComponent,
    GroupDashboardComponent,
    HomeDashboardComponent,
    MainContainerComponent,
    MemberOptionsComponent,
    ActivityDashboardComponent
],
  standalone: true
})
export class MainComponent {
  
  constructor(public sharedState: SharedStateService) {
    console.log('MainComponent initialized with SharedStateService');
  }

  // === Event Handlers ===
  onNavigationChange(tab: string): void {
    this.sharedState.setActiveTab(tab);
  }

  onGroupSelect(groupId: string): void {
    this.sharedState.setSelectedGroup(groupId);
  }

  onChannelSelect(data: { groupId: string, channelId: string }): void {
    this.sharedState.setSelectedChannel(data.channelId, data.groupId);
  }

  onSearchQuery(query: string): void {
    console.log('Search query:', query);
    // TODO: 검색 로직 구현
  }

  onNotificationClick(): void {
    console.log('Notification clicked');
    // TODO: 알림 모달 또는 페이지 열기
  }

  onHelpClick(): void {
    console.log('Help clicked');
    // TODO: 도움말 페이지 열기
  }

  onProfileClick(): void {
    console.log('Profile clicked');
    // TODO: 프로필 드롭다운 또는 페이지 열기
  }
}