import { Injectable } from "@angular/core";
import { DataCacheService } from "./DataCacheService";
import { HttpService } from "./HttpService";
import { HttpHeaders } from "@angular/common/http";
import { environment } from "../../../environments/environment.prod";
import { Group } from "../Models/group";
import { UserService } from "./UserService";
import { groupList } from "../Models/groupList";

@Injectable({
    providedIn: 'root'
})
export class GroupService {

    constructor(private httpService: HttpService, private dataService: DataCacheService, private userSerivce: UserService) {}

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
        const url = environment.apiUrl + `/api/group/getGroupInfo?name=${groupname}`;
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        const response = this.httpService.get(url, headers).subscribe(async (data: Group) => {
            this.dataService.setCache(groupname, data);
            return await this.dataService.getCache(groupname);
        });
        return undefined;
    }

    async getGroupList(): Promise<string[]> {
        const cacheGroupList: string[] | null = await this.dataService.getCache('groupList');

        if (cacheGroupList) {
            return cacheGroupList;
        }
        const url = environment.apiUrl + '/api/group/getGroupList';
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        const response = await this.httpService.get(url, headers).toPromise();
        this.dataService.setCache('groupList', response);
        const groupList: string[] | null = await this.dataService.getCache('groupList')
        return groupList ? groupList : [];
    }

    async joinUser(group: string, user: string): Promise<boolean> {
        const url = environment.apiUrl + '/api/group/joinUser';
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        const body = JSON.stringify({group: group, user: user});
        const response = await this.httpService.post(url, body, headers).toPromise();
        let cacheGroup: Group | null = await this.dataService.getCache(group);
        if (cacheGroup) {
            cacheGroup.memberNum += 1;
        }
        this.dataService.setCache(group, cacheGroup);
        return true;
    }

    async departUser(group: string, user: string): Promise<boolean> {
        const url = environment.apiUrl + '/api/group/departUser';
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        const body = JSON.stringify({user: user, group: group});
        await this.httpService.post(url, body, headers).toPromise();
        let cacheGroup: Group | null = await this.dataService.getCache(group);
        if (cacheGroup) {
            cacheGroup.memberNum -= 1;
        }
        this.dataService.setCache(group, cacheGroup);
        return true;
    }

    async questSuccess(group: string, user: string, questList: string[]): Promise<boolean> {
        const url = environment.apiUrl + '/api/group/questSuccess';
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        const body = JSON.stringify({group: group, user: user, questList: questList});
        const response = await this.httpService.post(url, body, headers).toPromise();
        let cacheGroup: Group | null = await this.dataService.getCache(group);
        if (cacheGroup) {
            questList.forEach((quest) => {
                if (questList.filter((q) => q === quest).length)
                    cacheGroup.questSuccessNum[questList.indexOf(quest)] += 1;
            })
            this.dataService.setCache(group, cacheGroup);
        }
        return true;
    }
}