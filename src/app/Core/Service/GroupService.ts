import { Injectable } from "@angular/core";
import { DataCacheService } from "./DataCacheService";
import { HttpService } from "./HttpService";
import { HttpHeaders } from "@angular/common/http";
import { Group } from "../Models/group";

@Injectable({
    providedIn: 'root'
})
export class GroupService {

    constructor(private httpService: HttpService, private dataService: DataCacheService) {}

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
        const url = `/api/group/getGroupInfo?name=${groupname}`;
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        try {
            const response = this.httpService.get(url, headers).subscribe(async (data: Group) => {
                this.dataService.setCache(groupname, data);
                return await this.dataService.getCache(groupname);
            })
        } catch (e) {
            console.error("[API] getGroupInfo: " + e);
        }
        return undefined;
    }

    async getGroupList(): Promise<Group[] | []> {
        const url = '/api/group/getGroupList';
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        try {
            const response = await this.httpService.get(url, headers).toPromise();
            const groupList: Group[] | null = response;
            if (groupList) {
                groupList.forEach((group) => {
                    this.dataService.setCache(group.name, group);
                });
            }
            return groupList || [];
        } catch (e) {
            console.error("[API] getGroupList: " + e);
        }
        return [];
    }

    async questSuccessWithFeedback(
        group: string, 
        user: string, 
        questList: {club: string, quest: string, feedback: string}[],
        ): Promise<boolean> {
        const url = '/api/group/questSuccess';
        const headers = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        
        const body = JSON.stringify({
            group,
            user,
            questList
        });
        
        try {
            const response = await this.httpService.post(url + `?email=${user}`, body, headers).toPromise();
            
            // 기존 캐시 업데이트 로직
            let cacheGroup: Group | null = await this.dataService.getCache(group);
            if (cacheGroup) {
                questList.forEach((quest) => {
                    const questIndex = cacheGroup.questList.indexOf(quest.quest);
                    if (questIndex !== -1) {
                    cacheGroup.questSuccessNum[questIndex] += 1;
                    }
                });
                this.dataService.setCache(group, cacheGroup);
            }
            
            return true;
        } catch (error) {
            console.error('Error in questSuccessWithFeedback:', error);
            return false;
        }
    }
}