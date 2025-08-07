// MemberDashboard.ts - 이미지 업로드 아바타 버전
import { Component, signal, OnInit, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { ManagementDashboardService } from "../../Service/ManagementDashboard";
import { UserJoinList } from "../../../Core/Models/user";

interface UserProfile {
  username: string;
  email: string;
  avatar: string; // 이미지 URL 또는 base64 데이터
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
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  
  // 상태 관리
  activeSection = signal<string>('profile');
  isLoading = signal<boolean>(false);
  showDeleteConfirm = signal<boolean>(false);
  showAvatarSelector = signal<boolean>(false);
  avatarUploading = signal<boolean>(false);
  
  // 사용자 데이터
  userProfile = signal<UserProfile>({
    username: '김사용자',
    email: 'user@example.com',
    avatar: '/assets/images/default-avatar.png', // 기본 아바타 이미지
    joinDate: new Date('2024-01-15'),
    totalQuests: 156,
    completedQuests: 89,
    currentStreak: 12,
    badges: ['🔥', '⭐', '💪', '📚']
  });

  // 그룹 데이터를 signal로 관리
  joinedGroups = signal<UserJoinList['joinList'] | undefined>(undefined);
  groupsLoading = signal<boolean>(false);

  // 아바타 미리보기 URL
  avatarPreviewUrl = signal<string | null>(null);
  selectedAvatarFile = signal<File | null>(null);

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
    await this.loadJoinedGroups();
  }

  private async loadUserData(): Promise<void> {
    this.userProfile.set(await this.managementDashboardService.getUserProfile());
  }

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
    if (!this.showAvatarSelector()) {
      this.resetAvatarSelection();
    }
  }

  // 파일 입력 트리거
  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  // 파일 선택 처리
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // 파일 유효성 검사
    if (!this.isValidImageFile(file)) {
      this.showSuccessMessage('지원하지 않는 파일 형식입니다. JPG, PNG, GIF 파일만 업로드 가능합니다.');
      return;
    }

    // 파일 크기 검사 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      this.showSuccessMessage('파일 크기는 5MB 이하만 업로드 가능합니다.');
      return;
    }

    this.selectedAvatarFile.set(file);
    this.createPreviewUrl(file);
  }

  // 이미지 파일 유효성 검사
  private isValidImageFile(file: File): boolean {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    return allowedTypes.includes(file.type);
  }

  // 미리보기 URL 생성
  private createPreviewUrl(file: File): void {
    if (this.avatarPreviewUrl()) {
      URL.revokeObjectURL(this.avatarPreviewUrl()!);
    }

    const previewUrl = URL.createObjectURL(file);
    this.avatarPreviewUrl.set(previewUrl);
  }

  // 아바타 미리보기 리셋
  private resetAvatarSelection(): void {
    if (this.avatarPreviewUrl()) {
      URL.revokeObjectURL(this.avatarPreviewUrl()!);
      this.avatarPreviewUrl.set(null);
    }
    this.selectedAvatarFile.set(null);
    
    // 파일 입력 초기화
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  // 아바타 변경 확인
  async confirmAvatarChange(): Promise<void> {
    const file = this.selectedAvatarFile();
    if (!file) {
      this.showSuccessMessage('선택된 파일이 없습니다.');
      return;
    }

    this.avatarUploading.set(true);
    
    try {
      // 파일을 base64 또는 FormData로 변환하여 서버에 전송
      await this.uploadAvatarImage(file);
      
      // 성공적으로 업로드되면 프로필 업데이트
      const newAvatarUrl = this.avatarPreviewUrl() || URL.createObjectURL(file);
      this.userProfile.update(profile => ({
        ...profile,
        avatar: newAvatarUrl
      }));
      
      this.showAvatarSelector.set(false);
      this.showSuccessMessage('아바타가 성공적으로 변경되었습니다.');
      
    } catch (error) {
      console.error('아바타 업로드 실패:', error);
      this.showSuccessMessage('아바타 변경에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      this.avatarUploading.set(false);
      this.resetAvatarSelection();
    }
  }

  // 아바타 이미지 업로드
  private async uploadAvatarImage(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const base64Data = e.target?.result as string;
          
          // ManagementDashboardService의 setAvatar를 통해 서버로 전송
          // base64 데이터 또는 파일 객체를 전송
          // await this.managementDashboardService.setAvatarImage(base64Data);
          
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('파일 읽기에 실패했습니다.'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  // 현재 아바타 이미지 URL 가져오기
  getCurrentAvatarUrl(): string {
    return this.avatarPreviewUrl() || this.userProfile().avatar || '/assets/images/default-avatar.png';
  }

  // 아바타 이미지 로드 에러 처리
  onAvatarImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/assets/images/default-avatar.png';
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
        console.log('그룹 탈퇴:', groupId);
        await this.managementDashboardService.leaveGroup(groupId);
        
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

  // 컴포넌트 파괴 시 메모리 정리
  ngOnDestroy(): void {
    if (this.avatarPreviewUrl()) {
      URL.revokeObjectURL(this.avatarPreviewUrl()!);
    }
  }
}