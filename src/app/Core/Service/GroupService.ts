import { Injectable } from "@angular/core";
import { DataCacheService } from "./DataCacheService";
import { HttpService } from "./HttpService";
import { HttpHeaders } from "@angular/common/http";
import { matchingGroupTable, environment } from "../../../environments/environtment";
import { Group } from "../Models/group";

@Injectable({
    providedIn: 'root'
})
export class GroupService {

    constructor(private httpService: HttpService, private dataService: DataCacheService) {}

    table = matchingGroupTable;
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

    async getGroupList(): Promise<Group[] | []> {
        const url = environment.apiUrl + '/api/group/getGroupList';
        const headers: HttpHeaders = new HttpHeaders({
            'Content-Type': 'application/json'
        });
        const response = await this.httpService.get(url, headers).toPromise();
        const groupList: Group[] | null = response;
        if (groupList) {
            groupList.forEach((group) => {
                this.dataService.setCache(group.name, group);
            });
        }
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