import { Injectable } from "@angular/core";
import { UserService } from "../../Core/Service/UserService";
import { SharedStateService } from "../../Core/Service/SharedService";
import { GroupService } from "../../Core/Service/GroupService";
import { LoginService } from "../../Auth/Service/LoginService";
import { UserJoinList } from "../../Core/Models/user";

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
    constructor(public shared: SharedStateService,private userService: UserService, private loginService: LoginService) {}

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
            userProfile.avatar = user.avatar ? user.avatar : '';
            userProfile.joinDate = user.joinDate ? new Date(user.joinDate) : new Date();
        } else {
            userProfile.username = 'default';
            userProfile.email = 'default';
            userProfile.avatar = '';
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
            await this.userService.setUsername(user.id, username);
            user.name = username;
            await this.shared.setCurrentUser(user);
        } else {
            await this.userService.setUsername("", username);
        }
    }

    async getGroupList(): Promise<UserJoinList | undefined> {
        const group: UserJoinList | undefined = await this.userService.getUserJoinList();
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

    async departUser(username:string = ""): Promise<void> {
        const user = this.shared.currentUser();
        if (user) {
            await this.loginService.deleteCurrentUser();
        } else {
            await this.userService.leaveGroup("", username);
        }
    }
}