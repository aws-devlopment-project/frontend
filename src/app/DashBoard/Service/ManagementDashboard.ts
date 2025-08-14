// ManagementDashboardService.ts - 실시간 동기화 개선
import { Injectable } from "@angular/core";
import { UserService } from "../../Core/Service/UserService";
import { SharedStateService } from "../../Core/Service/SharedService";
import { LoginService } from "../../Auth/Service/LoginService";
import { UserJoin } from "../../Core/Models/user";
import { HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HttpService } from "../../Core/Service/HttpService";
import { DataCacheService } from "../../Core/Service/DataCacheService";
import { Router } from "@angular/router";

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

@Injectable({
    providedIn: 'platform'
})
export class ManagementDashboardService {
    constructor(
        public shared: SharedStateService,
        private userService: UserService, 
        private loginService: LoginService,
        private httpService: HttpService,
        private cacheService: DataCacheService,
        private router: Router
    ) {}

    serverUrl: string = "https://server.teamnameless.click"

    // === 기존 메서드들 유지 ===
    
    async getUserProfile() {
        let userProfile: UserProfile = {
            username: '',
            email: '',
            avatar: '',
            joinDate: new Date(),
            totalQuests: 0,
            completedQuests: 0,
            currentStreak: 0,
            badges: []
        };
        const user = this.shared.currentUser();
        const userQuestPrev = await this.userService.getUserQuestPrev();

        if (user) {
            userProfile.username = user.name;
            userProfile.email = user.id;
            userProfile.avatar = user.avatar || '/assets/images/default-avatar.png';
            userProfile.joinDate = user.joinDate ? new Date(user.joinDate) : new Date();
        } else {
            userProfile.username = 'default';
            userProfile.email = 'default';
            userProfile.avatar = '/assets/images/default-avatar.png';
            userProfile.joinDate = new Date();
        }
        if (userQuestPrev) {
            userQuestPrev.prevQuestTotalList.forEach((num) => {
                userProfile.totalQuests += 1;
                userProfile.completedQuests += num.success ? 1 : 0;
            });
        }
        return userProfile;
    }

    async setUsername(username: string) {
        try {
            const user = this.shared.currentUser();
            const userId = user ? user.id : "";

            console.log('📝 Amplify custom:username 업데이트 시작...');
            await this.loginService.updateCustomUsername(username);
            console.log('✅ Amplify custom:username 업데이트 완료');

            console.log('📝 백엔드 username 업데이트 시작...');
            if (user) {
                await this.userService.setUsername(user.id, username);
            } else {
                await this.userService.setUsername("", username);
            }
            console.log('✅ 백엔드 username 업데이트 완료');

            if (user) {
                user.name = username;
                this.shared.setCurrentUser(user);
                console.log('✅ 로컬 상태 업데이트 완료');
            }

            console.log('🎉 사용자명 업데이트 전체 프로세스 완료');
            
        } catch (error) {
            console.error('❌ 사용자명 업데이트 실패:', error);
            
            if (error && typeof error === 'object' && 'name' in error) {
                switch (error.name) {
                    case 'NotAuthorizedException':
                        throw new Error('인증이 필요합니다. 다시 로그인해 주세요.');
                    case 'UserNotFoundException':
                        throw new Error('사용자를 찾을 수 없습니다.');
                    case 'InvalidParameterException':
                        throw new Error('잘못된 사용자명입니다. 다른 이름을 시도해 주세요.');
                    case 'LimitExceededException':
                        throw new Error('요청 횟수가 초과되었습니다. 잠시 후 다시 시도해 주세요.');
                    default:
                        throw new Error(`사용자명 업데이트 중 오류가 발생했습니다: ${error || '알 수 없는 오류'}`);
                }
            }
            
            throw new Error('사용자명 업데이트에 실패했습니다. 다시 시도해 주세요.');
        }
    }

    private async resizeImage(file: File, maxWidth: number = 200, maxHeight: number = 200): Promise<string> {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve(resizedDataUrl);
            };
            
            img.onerror = () => reject(new Error('이미지 로드 실패'));
            img.src = URL.createObjectURL(file);
        });
    }

    async setAvatarImage(file: File): Promise<{ success: boolean; error?: string }> {
        try {
            const user = this.shared.currentUser();
            const userId = user ? user.id : "";

            const validation = this.validateImageFile(file);
            if (!validation.isValid) {
                return { success: false, error: validation.error };
            }

            const resizedBase64 = await this.resizeImage(file);
            
            const payload = {
                user: userId,
                avatar: resizedBase64.split(',')[1]
            };

            const response = await firstValueFrom(
                this.httpService.post(this.serverUrl + `/api/user/setUserAvatar`, payload, 
                    new HttpHeaders({ 'Content-Type': 'application/json' })
                )
            );

            if (user) {
                user.avatar = resizedBase64;
                await this.shared.setCurrentUser(user);
            }
            
            return { success: true };
        } catch (error) {
            console.error('아바타 업로드 실패:', error);
            return { 
                success: false, 
                error: '아바타 업로드에 실패했습니다. 다시 시도해 주세요.' 
            };
        }
    }

    private fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsDataURL(file);
        });
    }

    validateImageFile(file: File): { isValid: boolean; error?: string } {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const maxSize = 5 * 1024 * 1024;

        if (!allowedTypes.includes(file.type)) {
            return {
                isValid: false,
                error: '지원하지 않는 파일 형식입니다. JPG, PNG, GIF, WebP 파일만 업로드 가능합니다.'
            };
        }

        if (file.size > maxSize) {
            return {
                isValid: false,
                error: '파일 크기는 5MB 이하만 업로드 가능합니다.'
            };
        }

        return { isValid: true };
    }

    async resetAvatar(): Promise<{ success: boolean; error?: string }> {
        try {
            const user = this.shared.currentUser();
            const userId = user ? user.id : "";

            await firstValueFrom(
                this.httpService.post(this.serverUrl + `/api/user/resetUserAvatar`, 
                    { user: userId },
                    new HttpHeaders({ 'Content-Type': 'application/json' })
                )
            );

            if (user) {
                user.avatar = '/assets/images/default-avatar.png';
                this.shared.setCurrentUser(user);
            }

            return { success: true };
        } catch (error) {
            console.error('아바타 리셋 실패:', error);
            return { 
                success: false, 
                error: '아바타 리셋에 실패했습니다.' 
            };
        }
    }

    async getGroupList(): Promise<UserJoin | null> {
        const group: UserJoin | null = await this.userService.getUserJoin();
        return group;
    }

    // === 개선된 그룹/채널 탈퇴 메서드들 ===

    /**
     * 그룹 탈퇴 (실시간 동기화 포함)
     */
    async leaveGroup(groupId: string): Promise<void> {
        console.log('🚪 그룹 탈퇴 서비스 시작:', groupId);
        
        try {
            const user = this.shared.currentUser();
            const userId = user ? user.id : "";
            
            // 1. 실제 API 호출
            await this.userService.leaveGroup(userId, groupId);
            console.log('✅ 그룹 탈퇴 API 성공');
            
            // 2. 즉시 SharedStateService에서 그룹 제거
            this.shared.removeGroupImmediately(groupId);
            console.log('⚡ SharedState에서 그룹 즉시 제거 완료');
            
            // 3. 캐시 무효화
            this.invalidateRelevantCaches();
            
            console.log('✅ 그룹 탈퇴 서비스 완료');
            
        } catch (error) {
            console.error('❌ 그룹 탈퇴 서비스 실패:', error);
            throw error;
        }
    }

    /**
     * 채널 탈퇴 (실시간 동기화 포함)
     */
    async leaveChannel(groupId: string, channelId: string): Promise<void> {
        console.log('🚪 채널 탈퇴 서비스 시작:', { groupId, channelId });
        
        try {
            const user = this.shared.currentUser();
            const userId = user ? user.id : "";
            
            // 1. 실제 API 호출
            await this.userService.leaveClub(userId, groupId, channelId);
            console.log('✅ 채널 탈퇴 API 성공');
            
            // 2. 즉시 SharedStateService에서 채널 제거
            this.shared.removeChannelImmediately(groupId, channelId);
            console.log('⚡ SharedState에서 채널 즉시 제거 완료');
            
            // 3. 캐시 무효화
            this.invalidateRelevantCaches();
            
            console.log('✅ 채널 탈퇴 서비스 완료');
            
        } catch (error) {
            console.error('❌ 채널 탈퇴 서비스 실패:', error);
            throw error;
        }
    }

    /**
     * 관련 캐시들을 무효화하여 최신 데이터 보장
     */
    private invalidateRelevantCaches(): void {
        console.log('🗑️ 관련 캐시 무효화 시작...');
        
        try {
            // UserJoin 캐시 삭제
            this.cacheService.removeCache('userJoin');
            
            // UserStatus 캐시도 삭제 (그룹 관련 정보가 있을 수 있음)
            this.cacheService.removeCache('userStatus');
            
            // 기타 그룹 관련 캐시들 삭제
            this.cacheService.removeCache('groupList');
            this.cacheService.removeCache('clubList');
            
            console.log('✅ 캐시 무효화 완료');
            
        } catch (error) {
            console.error('❌ 캐시 무효화 실패:', error);
        }
    }

    /**
     * 전체 데이터 재동기화 (문제 발생 시 사용)
     */
    async forceSyncAfterGroupChanges(): Promise<void> {
        console.log('🔄 그룹 변경 후 강제 동기화 시작...');
        
        try {
            // 1. 모든 관련 캐시 무효화
            this.invalidateRelevantCaches();
            
            // 2. SharedStateService 강제 새로고침
            await this.shared.forceRefreshUserJoin();
            
            console.log('✅ 강제 동기화 완료');
            
        } catch (error) {
            console.error('❌ 강제 동기화 실패:', error);
            
            // 최후의 수단: 전체 앱 상태 재초기화
            try {
                console.log('🚨 최후의 수단: 전체 상태 재초기화');
                await this.shared.safeForcedReinitialization();
            } catch (resetError) {
                console.error('❌ 전체 상태 재초기화도 실패:', resetError);
            }
        }
    }

    /**
     * 데이터 일관성 검증 (선택사항 - 디버깅용)
     */
    async validateDataConsistency(): Promise<{
        isConsistent: boolean;
        issues: string[];
        recommendations: string[];
    }> {
        const issues: string[] = [];
        const recommendations: string[] = [];
        
        try {
            // 1. SharedState vs UserService 데이터 비교
            const sharedUserJoin = this.shared.userJoin();
            const serviceUserJoin = await this.userService.getUserJoin();
            
            if (!sharedUserJoin && serviceUserJoin) {
                issues.push('SharedState에 UserJoin 데이터가 없음');
                recommendations.push('SharedState 강제 새로고침 실행');
            }
            
            if (sharedUserJoin && serviceUserJoin) {
                const sharedGroupCount = sharedUserJoin.joinList?.length || 0;
                const serviceGroupCount = serviceUserJoin.joinList?.length || 0;
                
                if (sharedGroupCount !== serviceGroupCount) {
                    issues.push(`그룹 수 불일치 (SharedState: ${sharedGroupCount}, Service: ${serviceGroupCount})`);
                    recommendations.push('데이터 동기화 실행');
                }
            }
            
            // 2. 현재 선택 상태 유효성 검증
            const selectedGroup = this.shared.selectedGroup();
            const selectedChannel = this.shared.selectedChannel();
            
            if (selectedGroup && sharedUserJoin) {
                const groupExists = sharedUserJoin.joinList?.some(g => g.groupname === selectedGroup);
                if (!groupExists) {
                    issues.push(`선택된 그룹이 가입 목록에 없음: ${selectedGroup}`);
                    recommendations.push('선택 상태 초기화');
                }
            }
            
            if (selectedChannel && selectedGroup && sharedUserJoin) {
                const group = sharedUserJoin.joinList?.find(g => g.groupname === selectedGroup);
                const channelExists = group?.clubList?.some(c => 
                    (typeof c === 'string' ? c : c.name) === selectedChannel
                );
                if (!channelExists) {
                    issues.push(`선택된 채널이 그룹에 없음: ${selectedChannel}`);
                    recommendations.push('채널 선택 초기화');
                }
            }
            
        } catch (error) {
            issues.push(`일관성 검증 중 오류: ${error}`);
            recommendations.push('전체 상태 재초기화');
        }
        
        return {
            isConsistent: issues.length === 0,
            issues,
            recommendations
        };
    }

    // === 기존 계정 탈퇴 메서드 ===
    
    async departUser(username: string = ""): Promise<void> {
        const user = this.shared.currentUser();
        if (user) {
            const ans = await this.userService.departUser(user.id);
        } else {
            await this.userService.leaveGroup("", username);
        }
        this.router.navigate(['/login']);
    }
}