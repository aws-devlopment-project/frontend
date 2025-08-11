// MemberDashboard.ts - 완전한 업데이트 버전
import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { ManagementDashboardService } from "../../Service/ManagementDashboard";
import { LoginService } from "../../../Auth/Service/LoginService";
import { UserJoin } from "../../../Core/Models/user";

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

// 비밀번호 변경 폼 인터페이스 추가
interface PasswordChangeForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
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
  
  // 비밀번호 변경 관련 signals 추가
  showPasswordChangeModal = signal<boolean>(false);
  passwordChangeLoading = signal<boolean>(false);
  passwordChangeError = signal<string | null>(null);
  passwordChangeSuccess = signal<boolean>(false);
  
  // 비밀번호 폼 데이터
  passwordForm = signal<PasswordChangeForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // 비밀번호 강도 관련 (재사용)
  newPasswordStrength = signal<'weak' | 'medium' | 'strong'>('weak');
  newPasswordRequirements = signal({
    minLength: false,
    hasLowercase: false,
    hasUppercase: false,
    hasNumber: false,
    hasSpecialChar: false
  });
  
  // 사용자 데이터
  userProfile = signal<UserProfile>({
    username: '김사용자',
    email: 'user@example.com',
    avatar: '/assets/images/default-avatar.png',
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

  constructor(
    private managementDashboardService: ManagementDashboardService,
    private loginService: LoginService // 추가된 의존성 주입
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadUserData();
    await this.loadJoinedGroups();
  }

  ngOnDestroy(): void {
    this.cleanupResources();
  }

  // === 비밀번호 변경 관련 메서드들 ===
  
  // 비밀번호 변경 모달 표시
  changePassword(): void {
    this.showPasswordChangeModal.set(true);
    this.clearPasswordForm();
    this.clearPasswordMessages();
  }

  // 비밀번호 변경 모달 닫기
  closePasswordChangeModal(): void {
    this.showPasswordChangeModal.set(false);
    this.clearPasswordForm();
    this.clearPasswordMessages();
  }

  // 비밀번호 폼 데이터 업데이트
  updatePasswordForm(field: keyof PasswordChangeForm, value: string): void {
    const currentForm = this.passwordForm();
    this.passwordForm.set({
      ...currentForm,
      [field]: value
    });

    // 새 비밀번호 입력 시 강도 검증
    if (field === 'newPassword') {
      this.validateNewPasswordStrength(value);
    }

    this.clearPasswordMessages();
  }

  // 새 비밀번호 강도 검증
  private validateNewPasswordStrength(password: string): void {
    const requirements = {
      minLength: password.length >= 8,
      hasLowercase: /[a-z]/.test(password),
      hasUppercase: /[A-Z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    this.newPasswordRequirements.set(requirements);

    // 강도 계산
    const passedRequirements = Object.values(requirements).filter(Boolean).length;
    
    if (passedRequirements < 3) {
      this.newPasswordStrength.set('weak');
    } else if (passedRequirements < 5) {
      this.newPasswordStrength.set('medium');
    } else {
      this.newPasswordStrength.set('strong');
    }
  }

  // 새 비밀번호 요구사항 완성도 계산
  get newPasswordCompletionPercentage(): number {
    const requirements = this.newPasswordRequirements();
    const completed = Object.values(requirements).filter(Boolean).length;
    return Math.round((completed / 5) * 100);
  }

  // 비밀번호 변경 폼 유효성 검사
  isPasswordFormValid(): boolean {
    const form = this.passwordForm();
    return (
      form.currentPassword.length > 0 &&
      form.newPassword.length >= 8 &&
      form.confirmPassword.length > 0 &&
      form.newPassword === form.confirmPassword &&
      this.newPasswordStrength() !== 'weak'
    );
  }

  // 비밀번호 일치 여부 확인
  get passwordsMatch(): boolean {
    const form = this.passwordForm();
    return form.newPassword === form.confirmPassword;
  }

  // 비밀번호 변경 실행
  async submitPasswordChange(): Promise<void> {
    if (!this.isPasswordFormValid()) {
      this.passwordChangeError.set('모든 필드를 올바르게 입력해주세요.');
      return;
    }

    const form = this.passwordForm();
    
    if (form.newPassword !== form.confirmPassword) {
      this.passwordChangeError.set('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
      return;
    }

    this.passwordChangeLoading.set(true);
    this.clearPasswordMessages();

    try {
      await this.loginService.updatePassword(form.currentPassword, form.newPassword);
      
      this.passwordChangeSuccess.set(true);
      this.showMessage('비밀번호가 성공적으로 변경되었습니다.', 'success');
      
      // 3초 후 모달 자동 닫기
      setTimeout(() => {
        this.closePasswordChangeModal();
      }, 3000);

    } catch (error: any) {
      console.error('비밀번호 변경 실패:', error);
      this.passwordChangeError.set(error.message || '비밀번호 변경에 실패했습니다.');
    } finally {
      this.passwordChangeLoading.set(false);
    }
  }

  // 폼 초기화
  private clearPasswordForm(): void {
    this.passwordForm.set({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    this.newPasswordStrength.set('weak');
    this.newPasswordRequirements.set({
      minLength: false,
      hasLowercase: false,
      hasUppercase: false,
      hasNumber: false,
      hasSpecialChar: false
    });
  }

  // 메시지 초기화
  private clearPasswordMessages(): void {
    this.passwordChangeError.set(null);
    this.passwordChangeSuccess.set(false);
  }

  // === 기존 메서드들 (변경사항 없음) ===
  
  // 초기화 및 데이터 로드
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
      this.joinedGroups.set(groupList?.joinList);
    } catch (error) {
      console.error('그룹 데이터 로드 실패:', error);
      this.joinedGroups.set(undefined);
      this.showMessage('그룹 정보를 불러오는데 실패했습니다.', 'error');
    } finally {
      this.groupsLoading.set(false);
    }
  }

  // 섹션 관리
  setActiveSection(sectionId: string): void {
    this.activeSection.set(sectionId);
    this.clearMessages();
  }

  // 드래그 앤 드롭 이벤트 처리
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

  // 아바타 관리
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

  private processFile(file: File): void {
    this.clearMessages();
    
    const validation = this.validateImageFile(file);
    if (!validation.isValid) {
      this.uploadError.set(validation.error || '잘못된 파일입니다.');
      return;
    }

    this.selectedAvatarFile.set(file);
    this.createPreviewUrl(file);
  }

  private validateImageFile(file: File): { isValid: boolean; error?: string } {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

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

  private createPreviewUrl(file: File): void {
    if (this.avatarPreviewUrl()) {
      URL.revokeObjectURL(this.avatarPreviewUrl()!);
    }

    const previewUrl = URL.createObjectURL(file);
    this.avatarPreviewUrl.set(previewUrl);
  }

  resetAvatarSelection(): void {
    if (this.avatarPreviewUrl()) {
      URL.revokeObjectURL(this.avatarPreviewUrl()!);
      this.avatarPreviewUrl.set(null);
    }
    this.selectedAvatarFile.set(null);
    this.clearMessages();
    
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

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
      this.simulateUploadProgress();
      
      const resizedImage = await this.resizeImage(file, 200, 200);
      
      const result = await this.managementDashboardService.setAvatarImage(file);
      
      if (result && result.success) {
        await this.loadUserData();
        
        this.uploadSuccess.set(true);
        this.showAvatarSelector.set(false);
        
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

  private async resizeImage(file: File, maxWidth: number = 200, maxHeight: number = 200): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        try {
          const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
          const newWidth = img.width * ratio;
          const newHeight = img.height * ratio;
          
          canvas.width = newWidth;
          canvas.height = newHeight;
          
          ctx?.drawImage(img, 0, 0, newWidth, newHeight);
          
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

    setTimeout(() => {
      this.uploadProgress.set(100);
    }, 2000);
  }

  getCurrentAvatarUrl(): string {
    const previewUrl = this.avatarPreviewUrl();
    if (previewUrl) return previewUrl;
    
    const userAvatar = this.userProfile().avatar;
    if (userAvatar && userAvatar !== '/assets/images/default-avatar.png') {
      if (userAvatar.startsWith('data:image/')) {
        return userAvatar;
      }
      if (userAvatar.startsWith('http')) {
        return userAvatar;
      }
    }
    
    return '/assets/images/default-avatar.png';
  }

  onAvatarImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/assets/images/default-avatar.png';
    console.warn('아바타 이미지 로드 실패, 기본 이미지로 대체');
  }

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

  // 프로필 관리
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

  // 그룹 관리
  async leaveGroup(groupId: string): Promise<void> {
    if (confirm('정말로 이 그룹에서 탈퇴하시겠습니까? 그룹 내 모든 채널에서도 탈퇴됩니다.')) {
      try {
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

  // 계정 관리
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

  // 기타 기능
  contactSupport(): void {
    window.open('mailto:support@example.com?subject=문의사항', '_blank');
  }

  openHelpCenter(): void {
    window.open('https://help.example.com', '_blank');
  }

  // 메시지 관리
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
        alert(message);
    }
  }

  // 유틸리티 메서드
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

  // 리소스 정리
  private cleanupResources(): void {
    if (this.avatarPreviewUrl()) {
      URL.revokeObjectURL(this.avatarPreviewUrl()!);
      this.avatarPreviewUrl.set(null);
    }
  }
}