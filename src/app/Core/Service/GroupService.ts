import { Injectable } from "@angular/core";
import { DataCacheService } from "./DataCacheService";
import { HttpService } from "./HttpService";
import { HttpHeaders } from "@angular/common/http";
import { Group } from "../Models/group";
import { firstValueFrom } from 'rxjs';
import { createGroup, createGroupList } from "../Models/group";
import { UserQuestCur } from "../Models/user";
import { UserService } from "./UserService";
import { environment } from "../../../environments/environtment";

@Injectable({
    providedIn: 'root'
})
export class GroupService {

    constructor(private httpService: HttpService, private dataService: DataCacheService, private userService: UserService) {}

    serverUrl: string = "https://server.teamnameless.click"

    async checkQuestCreateTime(groupname: string) : Promise<boolean> {
        const group: Group | null = await this.dataService.getCache(groupname);

        if (group) {
            const record = group.questCreateTime.setHours(0, 0, 0, 0);
            const now = new Date().setHours(0, 0, 0, 0);
            if (record > now)
                return true;
        }
        return false;
    }

    async getGroupInfo(groupname: string): Promise<Group | undefined> {
        const group: Group | null = await this.dataService.getCache(groupname);
        if (group) {
            return group;
        }
        const url = this.serverUrl + `/api/group/getGroupInfo?name=${groupname}`;
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        try {
            const response = this.httpService.get(url, createGroup, headers).subscribe(async (data: Group) => {
                if (data.id === -1) {
                    return undefined;
                }
                this.dataService.setCache(groupname, data);
                return await this.dataService.getCache(groupname);
            })
        } catch (e) {
            console.error("[API] getGroupInfo: " + e);
        }
        return undefined;
    }

    async getGroupList(): Promise<Group[]> {
        const url = this.serverUrl + '/api/group/getGroupList';
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        
        try {
            const data = await firstValueFrom(
                this.httpService.get(url, createGroupList, headers)
            );
            
            if (data && data.length !== 0) {
                data.forEach((group) => {
                    this.dataService.setCache(group.name, group);
                });
            }
            
            return data || [];
        } catch (e) {
            console.error("[API] getGroupList: " + e);
            return [];
        }
    }

    async questSuccessWithFeedback(
        group: string, 
        user: string, 
        club: string,
        quest: string,
        feedback: string,
        isLike: boolean | undefined
        ): Promise<boolean> {
        const url = this.serverUrl + '/api/group/questSuccess';
        const headers = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        
        const body = JSON.stringify({
            group,
            user,
            quest,
            club,
            feedback,
            isLike
        });
        
        try {
            const response = await this.httpService.post(url + `?email=${user}`, body, headers).toPromise();
            let cacheGroup: Group | null = await this.dataService.getCache(group);
            if (cacheGroup) {
                const questIndex = cacheGroup.questList.indexOf(quest);
                if (questIndex !== -1) {
                    cacheGroup.questSuccessNum[questIndex] += 1;
                }
            };
            this.dataService.setCache(group, cacheGroup);
            let userQuestCur: UserQuestCur | null = await this.dataService.getCache('userQuestCur');
            if (!userQuestCur)
                userQuestCur = await this.userService.getUserQuestCur(user);
            if (userQuestCur) {
                const questIndex = userQuestCur.curQuestTotalList.findIndex(
                    (q) => q.quest === quest && q.group === group && q.club === club
                );
                console.log("questIndex: " + questIndex);
                console.log("quest: " + quest);
                if (questIndex !== -1) {
                    userQuestCur.curQuestTotalList[questIndex].success = true;
                }
            };
            this.dataService.setCache('userQuestCur', userQuestCur);
            return true;
        } catch (error) {
            console.error('Error in questSuccessWithFeedback:', error);
            return false;
        }
    }
}