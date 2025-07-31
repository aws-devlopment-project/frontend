import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SideBarComponent } from "../Core/Component/SideBar/SideBar";
import { HeaderBarComponent } from "../Core/Component/HeaderBar/HeaderBar";
import { GroupDashboardComponent } from "../DashBoard/Component/GroupDashboard/GroupDashboard";
import { HomeDashboardComponent } from "../DashBoard/Component/HomeDashboard/HomeDashboard";

@Component({
  selector: 'app-main',
  templateUrl: './Main.html',
  styleUrl: './Main.css',
  imports: [
    CommonModule,
    SideBarComponent,
    HeaderBarComponent,
    GroupDashboardComponent,
    HomeDashboardComponent
  ],
  standalone: true
})
export class MainComponent {
  currentPage = signal('갓생살기 챌린지');
  activeTab = signal('challenge');

  onNavigationChange(tab: string): void {
    this.activeTab.set(tab);
    
    // 페이지 제목 업데이트
    switch(tab) {
      case 'home':
        this.currentPage.set('홈');
        break;
      case 'challenge':
        this.currentPage.set('갓생살기 챌린지');
        break;
      case 'dashboard':
        this.currentPage.set('대시보드');
        break;
      case 'member':
        this.currentPage.set('회원관리');
        break;
      default:
        this.currentPage.set('갓생살기 챌린지');
    }
    
    console.log('Navigation changed to:', tab);
  }

  onSearchQuery(query: string): void {
    console.log('Search query:', query);
    // 검색 로직 구현
  }

  onNotificationClick(): void {
    console.log('Notification clicked');
    // 알림 모달 또는 페이지 열기
  }

  onHelpClick(): void {
    console.log('Help clicked');
    // 도움말 페이지 열기
  }

  onProfileClick(): void {
    console.log('Profile clicked');
    // 프로필 드롭다운 또는 페이지 열기
  }
}