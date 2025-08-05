import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { ManagementDashboardService } from "../../Service/ManagementDashboard";
import { UserJoinList } from "../../../Core/Models/user";

interface UserProfile {
  username: string;
  email: string;
  avatar: string;
  joinDate: Date;
  totalQuests: number;
  completedQuests: number;
  currentStreak: number;
  badges: string[];
}

interface NotificationSettings {
  questReminders: boolean;
  groupActivity: boolean;
  achievements: boolean;
  weeklyReport: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

interface PrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private';
  activitySharing: boolean;
  questProgressVisible: boolean;
  onlineStatus: boolean;
}

interface AppSettings {
  theme: 'light' | 'dark' | 'auto';
  language: 'ko' | 'en';
  autoRefresh: boolean;
  soundEffects: boolean;
  animationEffects: boolean;
}

@Component({
  selector: 'app-member-dashboard',
  templateUrl: './MemberDashboard.html',
  styleUrl: './MemberDashboard.css',
  imports: [CommonModule, MatIconModule, FormsModule, RouterLink],
  providers: [ManagementDashboardService],
  standalone: true
})
export class MemberOptionsComponent implements OnInit {
  // 상태 관리
  activeSection = signal<string>('profile');
  isLoading = signal<boolean>(false);
  showDeleteConfirm = signal<boolean>(false);
  showAvatarSelector = signal<boolean>(false);
  
  // 사용자 데이터
  userProfile = signal<UserProfile>({
    username: '김사용자',
    email: 'user@example.com',
    avatar: '👤',
    joinDate: new Date('2024-01-15'),
    totalQuests: 156,
    completedQuests: 89,
    currentStreak: 12,
    badges: ['🔥', '⭐', '💪', '📚']
  });

  // 그룹 데이터를 signal로 관리
  joinedGroups = signal<UserJoinList['joinList'] | undefined>(undefined);
  groupsLoading = signal<boolean>(false);

  // 아바타 옵션
  availableAvatars = ['👤', '😊', '😎', '🤖', '👨‍💻', '👩‍💻', '🧑‍🎓', '👨‍🏫', '👩‍🏫', '🧑‍💼', '👨‍⚕️', '👩‍⚕️', '🧑‍🎨', '👨‍🚀', '👩‍🚀', '🧙‍♂️', '🧙‍♀️', '🦸‍♂️', '🦸‍♀️', '🐱', '🐶', '🦊', '🐼', '🐯', '🦁'];

  // 설정 데이터
  notificationSettings = signal<NotificationSettings>({
    questReminders: true,
    groupActivity: true,
    achievements: true,
    weeklyReport: false,
    emailNotifications: true,
    pushNotifications: false
  });

  privacySettings = signal<PrivacySettings>({
    profileVisibility: 'public',
    activitySharing: true,
    questProgressVisible: true,
    onlineStatus: true
  });

  appSettings = signal<AppSettings>({
    theme: 'light',
    language: 'ko',
    autoRefresh: true,
    soundEffects: true,
    animationEffects: true
  });

  // 메뉴 구성
  menuItems = [
    { id: 'profile', label: '프로필 관리', icon: 'person', description: '개인 정보 및 프로필 설정' },
    { id: 'groups', label: '그룹 관리', icon: 'group', description: '참여 그룹 및 채널 관리' },
    { id: 'support', label: '고객 지원', icon: 'help', description: '문의사항 및 도움말' },
    { id: 'account', label: '계정 관리', icon: 'account_circle', description: '비밀번호 변경 및 계정 탈퇴' }
  ];

  constructor(private managementDashboardService: ManagementDashboardService) {}

  async ngOnInit(): Promise<void> {
    await this.loadUserData();
    await this.loadJoinedGroups(); // 초기화 시점에 그룹 데이터 로드
  }

  private async loadUserData(): Promise<void> {
    // 실제 구현에서는 API 호출
    this.userProfile.set(await this.managementDashboardService.getUserProfile());
  }

  // 그룹 데이터를 한 번만 로드하는 메서드
  private async loadJoinedGroups(): Promise<void> {
    this.groupsLoading.set(true);
    try {
      const groupList = await this.managementDashboardService.getGroupList();
      console.log("management: ", groupList);
      this.joinedGroups.set(groupList?.joinList);
    } catch (error) {
      console.error('그룹 데이터 로드 실패:', error);
      this.joinedGroups.set(undefined);
    } finally {
      this.groupsLoading.set(false);
    }
  }

  // 섹션 변경
  setActiveSection(sectionId: string): void {
    this.activeSection.set(sectionId);
  }

  // 아바타 선택기 토글
  toggleAvatarSelector(): void {
    this.showAvatarSelector.update(show => !show);
  }

  // 아바타 변경
  async changeAvatar(newAvatar: string): Promise<void> {
    this.isLoading.set(true);
    
    try {
      await this.managementDashboardService.setAvatar(newAvatar);
      
      // 프로필 업데이트
      this.userProfile.update(profile => ({
        ...profile,
        avatar: newAvatar
      }));
      
      this.showAvatarSelector.set(false);
      this.showSuccessMessage('아바타가 성공적으로 변경되었습니다.');
    } catch (error) {
      console.error('아바타 변경 실패:', error);
      this.showSuccessMessage('아바타 변경에 실패했습니다.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // 프로필 업데이트
  async updateProfile(): Promise<void> {
    this.isLoading.set(true);
    
    try {
      await this.managementDashboardService.setUsername(this.userProfile().username);
      this.showSuccessMessage('프로필이 성공적으로 업데이트되었습니다.');
    } catch (error) {
      console.error('프로필 업데이트 실패:', error);
      this.showSuccessMessage('프로필 업데이트에 실패했습니다.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // 비밀번호 변경
  changePassword(): void {
    // 실제로는 비밀번호 변경 모달이나 페이지로 이동
  }

  // 그룹 탈퇴
  async leaveGroup(groupId: string): Promise<void> {
    if (confirm('정말로 이 그룹에서 탈퇴하시겠습니까? 그룹 내 모든 채널에서도 탈퇴됩니다.')) {
      try {
        // 실제 탈퇴 로직 수행
        console.log('그룹 탈퇴:', groupId);
        await this.managementDashboardService.leaveGroup(groupId);
        
        // 탈퇴 후 그룹 목록 새로고침
        await this.loadJoinedGroups();
        this.showSuccessMessage('그룹에서 탈퇴되었습니다.');
      } catch (error) {
        console.error('그룹 탈퇴 실패:', error);
        this.showSuccessMessage('그룹 탈퇴에 실패했습니다.');
      }
    }
  }

  // 채널 탈퇴
  async leaveClub(groupId: string, channelId: string): Promise<void> {
    if (confirm(`정말로 "${channelId}" 채널에서 탈퇴하시겠습니까?`)) {
      try {
        await this.managementDashboardService.leaveChannel(groupId, channelId);
        
        // 탈퇴 후 그룹 목록 새로고침
        await this.loadJoinedGroups();
        this.showSuccessMessage(`"${channelId}" 채널에서 탈퇴되었습니다.`);
      } catch (error) {
        console.error('채널 탈퇴 실패:', error);
        this.showSuccessMessage('채널 탈퇴에 실패했습니다.');
      }
    }
  }

  // 계정 탈퇴 확인 표시
  showDeleteAccountConfirm(): void {
    this.showDeleteConfirm.set(true);
  }

  // 계정 탈퇴 취소
  cancelDeleteAccount(): void {
    this.showDeleteConfirm.set(false);
  }

  // 계정 탈퇴 실행
  async deleteAccount(): Promise<void> {
    this.isLoading.set(true);
    await this.managementDashboardService.departUser();
    alert('계정이 성공적으로 탈퇴되었습니다. 이용해 주셔서 감사합니다.');
    
    // 로그아웃 및 홈페이지로 이동
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  }

  // 고객 지원
  contactSupport(): void {
    window.open('mailto:support@example.com?subject=문의사항', '_blank');
  }

  openHelpCenter(): void {
    window.open('https://help.example.com', '_blank');
  }

  // 유틸리티 메서드
  private showSuccessMessage(message: string): void {
    // 실제로는 토스트나 스낵바 표시
    alert(message);
  }

  getJoinDuration(): string {
    const joinDate = this.userProfile().joinDate;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - new Date(joinDate).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) {
      return `${diffDays}일`;
    } else if (diffDays < 365) {
      return `${Math.floor(diffDays / 30)}개월`;
    } else {
      return `${Math.floor(diffDays / 365)}년`;
    }
  }

  getCompletionRate(): number {
    const profile = this.userProfile();
    return Math.round((profile.completedQuests / profile.totalQuests) * 100);
  }

  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}