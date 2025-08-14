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
import { environment } from "../../../environments/environment.prod";

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
            // 아바타가 있으면 사용, 없으면 기본 이미지
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

            // 1. Amplify custom:username 속성 업데이트
            console.log('🔄 Amplify custom:username 업데이트 시작...');
            await this.loginService.updateCustomUsername(username);
            console.log('✅ Amplify custom:username 업데이트 완료');

            // 2. 백엔드 API 호출 (기존 로직)
            console.log('🔄 백엔드 username 업데이트 시작...');
            if (user) {
                await this.userService.setUsername(user.id, username);
            } else {
                await this.userService.setUsername("", username);
            }
            console.log('✅ 백엔드 username 업데이트 완료');

            // 3. 로컬 상태 업데이트
            if (user) {
                user.name = username;
                this.shared.setCurrentUser(user);
                console.log('✅ 로컬 상태 업데이트 완료');
            }

            console.log('🎉 사용자명 업데이트 전체 프로세스 완료');
            
        } catch (error) {
            console.error('❌ 사용자명 업데이트 실패:', error);
            
            // 에러 타입별 처리
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

    // 이미지 리사이징 기능 추가
    private async resizeImage(file: File, maxWidth: number = 200, maxHeight: number = 200): Promise<string> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
        // 비율 계산
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        
        // 이미지 그리기
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // base64로 변환
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(resizedDataUrl);
        };
        
        img.onerror = () => reject(new Error('이미지 로드 실패'));
        img.src = URL.createObjectURL(file);
    });
    }

    // setAvatarImage 메서드에서 리사이징 사용
    async setAvatarImage(file: File): Promise<{ success: boolean; error?: string }> {
    try {
        const user = this.shared.currentUser();
        const userId = user ? user.id : "";

        // 파일 유효성 검사
        const validation = this.validateImageFile(file);
        if (!validation.isValid) {
        return { success: false, error: validation.error };
        }

        // 이미지 리사이징
        const resizedBase64 = await this.resizeImage(file);
        
        const payload = {
        user: userId,
        avatar: resizedBase64.split(',')[1] // base64 헤더 제거
        };

        const response = await firstValueFrom(
        this.httpService.post(environment.apiUrl + `/api/user/setUserAvatar`, payload, 
            new HttpHeaders({ 'Content-Type': 'application/json' })
        )
        );

        // 로컬 상태 업데이트
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

    /**
     * 파일을 base64로 변환
     */
    private fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * 이미지 파일 유효성 검사
     */
    validateImageFile(file: File): { isValid: boolean; error?: string } {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const maxSize = 5 * 1024 * 1024; // 5MB

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

    /**
     * 아바타 리셋
     */
    async resetAvatar(): Promise<{ success: boolean; error?: string }> {
        try {
            const user = this.shared.currentUser();
            const userId = user ? user.id : "";

            await firstValueFrom(
                this.httpService.post(environment.apiUrl + `/api/user/resetUserAvatar`, 
                    { user: userId },
                    new HttpHeaders({ 'Content-Type': 'application/json' })
                )
            );

            // 로컬 상태 업데이트
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

    async leaveGroup(groupId: string): Promise<void> {
        const user = this.shared.currentUser();
        if (user) {
            await this.userService.leaveGroup(user.id, groupId);
        } else {
            await this.userService.leaveGroup("", groupId);
        }
    }

    async leaveChannel(groupId: string, channelId: string): Promise<void> {
        try {
            const user = this.shared.currentUser();
            const userId = user ? user.id : "";
            
            // 채널 탈퇴 API 호출
            await this.userService.leaveClub(userId, groupId, channelId);
        } catch (error) {
            console.error('채널 탈퇴 실패:', error);
            throw error;
        }
    }

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