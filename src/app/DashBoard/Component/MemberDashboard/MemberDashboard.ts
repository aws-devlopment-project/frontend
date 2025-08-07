// MemberDashboard.ts - 이미지 업로드 아바타 버전
// MemberDashboard.ts - 개선된 이미지 업로드 아바타 버전
import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { ManagementDashboardService } from "../../Service/ManagementDashboard";
import { UserJoin } from "../../../Core/Models/user";

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
export class MemberOptionsComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  
  // 기본 상태 관리
  activeSection = signal<string>('profile');
  isLoading = signal<boolean>(false);
  showDeleteConfirm = signal<boolean>(false);
  showAvatarSelector = signal<boolean>(false);
  avatarUploading = signal<boolean>(false);
  
  // 개선된 아바타 업로드 상태 관리
  isDragOver = signal<boolean>(false);
  uploadProgress = signal<number>(0);
  uploadError = signal<string | null>(null);
  uploadSuccess = signal<boolean>(false);
  
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
  joinedGroups = signal<UserJoin['joinList'] | undefined>(undefined);
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

  ngOnDestroy(): void {
    this.cleanupResources();
  }

  // === 초기화 및 데이터 로드 ===
  private async loadUserData(): Promise<void> {
    try {
      this.userProfile.set(await this.managementDashboardService.getUserProfile());
    } catch (error) {
      console.error('사용자 데이터 로드 실패:', error);
      this.showMessage('사용자 정보를 불러오는데 실패했습니다.', 'error');
    }
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
      this.showMessage('그룹 정보를 불러오는데 실패했습니다.', 'error');
    } finally {
      this.groupsLoading.set(false);
    }
  }

  // === 섹션 관리 ===
  setActiveSection(sectionId: string): void {
    this.activeSection.set(sectionId);
    this.clearMessages(); // 섹션 변경 시 메시지 초기화
  }

  // === 드래그 앤 드롭 이벤트 처리 ===
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFile(files[0]);
    }
  }

  // === 아바타 관리 ===
  toggleAvatarSelector(): void {
    this.showAvatarSelector.update(show => !show);
    if (!this.showAvatarSelector()) {
      this.resetAvatarSelection();
    }
    this.clearMessages();
  }

  triggerFileInput(): void {
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.click();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file) {
      this.processFile(file);
    }
  }

  // 파일 처리 로직 통합
  private processFile(file: File): void {
    this.clearMessages();
    
    // 파일 유효성 검사
    const validation = this.validateImageFile(file);
    if (!validation.isValid) {
      this.uploadError.set(validation.error || '잘못된 파일입니다.');
      return;
    }

    this.selectedAvatarFile.set(file);
    this.createPreviewUrl(file);
  }

  // 개선된 이미지 파일 유효성 검사
  private validateImageFile(file: File): { isValid: boolean; error?: string } {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: '지원하지 않는 파일 형식입니다. JPG, PNG, GIF, WebP 파일만 업로드 가능합니다.'
      };
    }

    if (file.size > maxSize) {
      const currentSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return {
        isValid: false,
        error: `파일 크기가 너무 큽니다. 현재: ${currentSizeMB}MB, 최대: 5MB`
      };
    }

    return { isValid: true };
  }

  // 미리보기 URL 생성
  private createPreviewUrl(file: File): void {
    // 기존 URL 정리
    if (this.avatarPreviewUrl()) {
      URL.revokeObjectURL(this.avatarPreviewUrl()!);
    }

    const previewUrl = URL.createObjectURL(file);
    this.avatarPreviewUrl.set(previewUrl);
  }

  // 아바타 선택 리셋
  resetAvatarSelection(): void {
    if (this.avatarPreviewUrl()) {
      URL.revokeObjectURL(this.avatarPreviewUrl()!);
      this.avatarPreviewUrl.set(null);
    }
    this.selectedAvatarFile.set(null);
    this.clearMessages();
    
    // 파일 입력 초기화
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  // 아바타 변경 확인 - 개선된 버전
  async confirmAvatarChange(): Promise<void> {
    const file = this.selectedAvatarFile();
    if (!file) {
      this.uploadError.set('선택된 파일이 없습니다.');
      return;
    }

    this.avatarUploading.set(true);
    this.uploadProgress.set(0);
    this.clearMessages();
    
    try {
      // 업로드 진행률 시뮬레이션
      this.simulateUploadProgress();
      
      // 이미지 리사이징 후 업로드
      const resizedImage = await this.resizeImage(file, 200, 200);
      
      // ManagementDashboardService를 통해 업로드
      const result = await this.managementDashboardService.setAvatarImage(file);
      
      if (result && result.success) {
        // 성공적으로 업로드되면 프로필 업데이트
        await this.loadUserData();
        
        this.uploadSuccess.set(true);
        this.showAvatarSelector.set(false);
        
        // 성공 메시지 자동 숨김
        setTimeout(() => {
          this.uploadSuccess.set(false);
        }, 3000);
        
      } else {
        const errorMsg = result?.error || '아바타 변경에 실패했습니다.';
        this.uploadError.set(errorMsg);
      }
      
    } catch (error) {
      console.error('아바타 업로드 실패:', error);
      this.uploadError.set('아바타 변경에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      this.avatarUploading.set(false);
      this.uploadProgress.set(0);
      this.resetAvatarSelection();
    }
  }

  // 이미지 리사이징 기능
  private async resizeImage(file: File, maxWidth: number = 200, maxHeight: number = 200): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        try {
          // 비율 계산
          const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
          const newWidth = img.width * ratio;
          const newHeight = img.height * ratio;
          
          canvas.width = newWidth;
          canvas.height = newHeight;
          
          // 이미지 그리기
          ctx?.drawImage(img, 0, 0, newWidth, newHeight);
          
          // base64로 변환 (품질 0.8)
          const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(resizedDataUrl);
        } catch (error) {
          reject(new Error('이미지 리사이징 실패'));
        } finally {
          URL.revokeObjectURL(img.src);
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('이미지 로드 실패'));
      };
      
      img.src = URL.createObjectURL(file);
    });
  }

  // 업로드 진행률 시뮬레이션
  private simulateUploadProgress(): void {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30;
      if (progress >= 90) {
        progress = 90;
        clearInterval(interval);
      }
      this.uploadProgress.set(progress);
    }, 200);

    // 업로드 완료 시 100%로 설정
    setTimeout(() => {
      this.uploadProgress.set(100);
    }, 2000);
  }

  // 현재 아바타 이미지 URL 가져오기 - 개선된 버전
  getCurrentAvatarUrl(): string {
    const previewUrl = this.avatarPreviewUrl();
    if (previewUrl) return previewUrl;
    
    const userAvatar = this.userProfile().avatar;
    if (userAvatar && userAvatar !== '/assets/images/default-avatar.png') {
      // base64 데이터인지 확인
      if (userAvatar.startsWith('data:image/')) {
        return userAvatar;
      }
      // URL인지 확인
      if (userAvatar.startsWith('http')) {
        return userAvatar;
      }
    }
    
    return '/assets/images/default-avatar.png';
  }

  // 아바타 이미지 로드 에러 처리
  onAvatarImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/assets/images/default-avatar.png';
    console.warn('아바타 이미지 로드 실패, 기본 이미지로 대체');
  }

  // 아바타 리셋 기능 추가
  async resetAvatar(): Promise<void> {
    if (confirm('아바타를 기본 이미지로 리셋하시겠습니까?')) {
      try {
        this.isLoading.set(true);
        const result = await this.managementDashboardService.resetAvatar();
        
        if (result && result.success) {
          await this.loadUserData();
          this.showMessage('아바타가 기본 이미지로 변경되었습니다.', 'success');
        } else {
          const errorMsg = result?.error || '아바타 리셋에 실패했습니다.';
          this.showMessage(errorMsg, 'error');
        }
      } catch (error) {
        console.error('아바타 리셋 실패:', error);
        this.showMessage('아바타 리셋에 실패했습니다.', 'error');
      } finally {
        this.isLoading.set(false);
      }
    }
  }

  // === 프로필 관리 ===
  async updateProfile(): Promise<void> {
    this.isLoading.set(true);
    this.clearMessages();
    
    try {
      await this.managementDashboardService.setUsername(this.userProfile().username);
      this.showMessage('프로필이 성공적으로 업데이트되었습니다.', 'success');
    } catch (error) {
      console.error('프로필 업데이트 실패:', error);
      this.showMessage('프로필 업데이트에 실패했습니다.', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  // === 그룹 관리 ===
  async leaveGroup(groupId: string): Promise<void> {
    if (confirm('정말로 이 그룹에서 탈퇴하시겠습니까? 그룹 내 모든 채널에서도 탈퇴됩니다.')) {
      try {
        console.log('그룹 탈퇴:', groupId);
        await this.managementDashboardService.leaveGroup(groupId);
        
        await this.loadJoinedGroups();
        this.showMessage('그룹에서 탈퇴되었습니다.', 'success');
      } catch (error) {
        console.error('그룹 탈퇴 실패:', error);
        this.showMessage('그룹 탈퇴에 실패했습니다.', 'error');
      }
    }
  }

  async leaveClub(groupId: string, channelId: string): Promise<void> {
    if (confirm(`정말로 "${channelId}" 채널에서 탈퇴하시겠습니까?`)) {
      try {
        await this.managementDashboardService.leaveChannel(groupId, channelId);
        
        await this.loadJoinedGroups();
        this.showMessage(`"${channelId}" 채널에서 탈퇴되었습니다.`, 'success');
      } catch (error) {
        console.error('채널 탈퇴 실패:', error);
        this.showMessage('채널 탈퇴에 실패했습니다.', 'error');
      }
    }
  }

  // === 계정 관리 ===
  showDeleteAccountConfirm(): void {
    this.showDeleteConfirm.set(true);
  }

  cancelDeleteAccount(): void {
    this.showDeleteConfirm.set(false);
  }

  async deleteAccount(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.managementDashboardService.departUser();
      alert('계정이 성공적으로 탈퇴되었습니다. 이용해 주셔서 감사합니다.');
      
      // 로컬 데이터 정리
      this.cleanupResources();
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';
    } catch (error) {
      console.error('계정 탈퇴 실패:', error);
      this.showMessage('계정 탈퇴에 실패했습니다.', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  // === 기타 기능 ===
  changePassword(): void {
    // 실제로는 비밀번호 변경 모달이나 페이지로 이동
    this.showMessage('비밀번호 변경 기능은 준비 중입니다.', 'info');
  }

  contactSupport(): void {
    window.open('mailto:support@example.com?subject=문의사항', '_blank');
  }

  openHelpCenter(): void {
    window.open('https://help.example.com', '_blank');
  }

  // === 메시지 관리 ===
  private clearMessages(): void {
    this.uploadError.set(null);
    this.uploadSuccess.set(false);
  }

  private showMessage(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    switch (type) {
      case 'success':
        this.uploadSuccess.set(true);
        setTimeout(() => this.uploadSuccess.set(false), 3000);
        break;
      case 'error':
        this.uploadError.set(message);
        break;
      default:
        // 임시로 alert 사용, 실제로는 토스트 메시지 등으로 대체
        alert(message);
    }
  }

  // === 유틸리티 메서드 ===
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
    if (profile.totalQuests === 0) return 0;
    return Math.round((profile.completedQuests / profile.totalQuests) * 100);
  }

  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // === 리소스 정리 ===
  private cleanupResources(): void {
    // 미리보기 URL 정리
    if (this.avatarPreviewUrl()) {
      URL.revokeObjectURL(this.avatarPreviewUrl()!);
      this.avatarPreviewUrl.set(null);
    }
    
    // 타이머 정리 등 추가 정리 작업이 필요하다면 여기에 추가
  }
}