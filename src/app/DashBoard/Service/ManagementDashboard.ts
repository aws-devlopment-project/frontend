import { Injectable } from "@angular/core";
import { UserService } from "../../Core/Service/UserService";
import { SharedStateService } from "../../Core/Service/SharedService";
import { LoginService } from "../../Auth/Service/LoginService";
import { UserJoinList } from "../../Core/Models/user";
import { HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from "../../../environments/environtment";
import { HttpService } from "../../Core/Service/HttpService";

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
        private httpService: HttpService
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
            userProfile.avatar = user.avatar ? user.avatar : '👤';
            userProfile.joinDate = user.joinDate ? new Date(user.joinDate) : new Date();
        } else {
            userProfile.username = 'default';
            userProfile.email = 'default';
            userProfile.avatar = '👤';
            userProfile.joinDate = new Date();
        }
        if (userQuestPrev) {
            userQuestPrev.prevQuestTotalList.forEach((num) => {
                userProfile.totalQuests += 1;
                userProfile.completedQuests += num.isSuccess ? 1 : 0;
            });
        }
        return userProfile;
    }

    async setUsername(username: string) {
        let user = this.shared.currentUser();
        if (user) {
            await this.userService.setUsername(user.id, username);
            user.name = username;
            this.shared.setCurrentUser(user);
        } else {
            await this.userService.setUsername("", username);
        }
    }

    async setAvatar(avatar: string) {
        try {
            const user = this.shared.currentUser();
            const userId = user ? user.id : "";
            
            // API 호출
            await firstValueFrom(
                this.httpService.post(environment.apiUrl + '/api/user/setAvatar', {
                    user: userId,
                    avatar: avatar
                }, new HttpHeaders({
                        'Content-Type': 'application/json'
            })))

            // 성공 시 로컬 상태 업데이트
            if (user) {
                user.avatar = avatar;
                await this.shared.setCurrentUser(user);
            }
            
            return { success: true };
        } catch (error) {
            console.error('아바타 설정 실패:', error);
            throw error;
        }
    }

    async getGroupList(): Promise<UserJoinList | null> {
        const group: UserJoinList | null = await this.userService.getUserJoinList();
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
            
            // 채널 탈퇴 API 호출 (실제 API에 맞게 수정 필요)
            this.httpService.post(environment.apiUrl + '/api/user/leaveClub', {
                user: userId,
                group: groupId,
                cludList: [channelId]
            }, new HttpHeaders({
                'Content-Type': 'application/json'
            }));
        } catch (error) {
            console.error('채널 탈퇴 실패:', error);
            throw error;
        }
    }

    async departUser(username: string = ""): Promise<void> {
        const user = this.shared.currentUser();
        if (user) {
            await this.loginService.deleteCurrentUser();
        } else {
            await this.userService.leaveGroup("", username);
        }
    }
}