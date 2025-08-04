import { Injectable, inject } from "@angular/core";
import { HttpService } from "./HttpService";
import { HttpHeaders } from "@angular/common/http";
import { environment } from "../../../environments/environment.prod";
import { DataCacheService } from "./DataCacheService";
import { UserCredentials, UserJoinList, UserStatus } from "../Models/user";
import { UserQuestContinuous, UserQuestCur, UserQuestPrev, UserQuestWeekly } from "../Models/user";
import { SharedStateService } from "./SharedService";
import { Router } from "@angular/router";

@Injectable({
    providedIn: 'root'
})
export class UserService {

    constructor(
        private httpService: HttpService,
        private cacheService: DataCacheService,
        private router: Router
    ) {}
    // UserQuest 관련 캐싱 테이블 구성을 위한 Get 요청들
    // getUserQuestCur : 현재 진행하고 있는 퀘스트들 목록
    async getUserQuestCur(id: string = ""): Promise<UserQuestCur | undefined> {
        try {
            if (id === "") {
                const user = await this.getUserCredentials();
                if (user) {
                    id = user.id;
                }
            }

            const cache: UserQuestCur | null = await this.cacheService.getCache('userQuestCur');
            if (cache) {
                return cache;
            } else {
                this.cacheService.removeCache('userQuestCur');
            }

            const response = this.httpService.get(environment.apiUrl + `/api/user/getUserQuestCur?id=${id}`, new HttpHeaders());
            if (response) {
                response.subscribe((data: UserQuestCur) => {
                    this.cacheService.setCache('userQuestCur', data);
                    return data;
                })
            }
        } catch (e) {
            console.log('[API] getUserQuestCur: ', e);
        }
        return undefined;
    }

    // getUserQuestContinuous : 연속으로 성공하고 있는 퀘스트 수
    async getUserQuestContinuous(id: string = ""): Promise<UserQuestContinuous | undefined> {
        try {
            if (id === "") {
                const user = await this.getUserCredentials();
                if (user) {
                    id = user.id;
                }
            }

            const cache: UserQuestContinuous | null = await this.cacheService.getCache('userQuestContinuous');
            if (cache) {
                return cache;
            } else {
                this.cacheService.removeCache('userQuestContinuous');
            }

            const response = this.httpService.get(environment.apiUrl + `/api/user/getUserQuestContinuous?id=${id}`, new HttpHeaders());
            if (response) {
                response.subscribe((data: UserQuestContinuous) => {
                    this.cacheService.setCache('userQuestContinuous', data);
                    return data;
                })
            }
        } catch (e) {
            console.log('[API] getUserQuestContinuous: ', e);
        }
        return undefined;
    }

    // getUserQuestPrev : 
    async getUserQuestPrev(id: string = ""): Promise<UserQuestPrev | undefined> {
        try {
            if (id === "") {
                const user = await this.getUserCredentials();
                if (user) {
                    id = user.id;
                }
            }

            const cache: UserQuestPrev | null = await this.cacheService.getCache('userQuestPrev');
            if (cache) {
                return cache;
            } else {
                this.cacheService.removeCache('userQuestPrev');
            }

            const response = this.httpService.get(environment.apiUrl + `/api/user/getUserQuestPrev?id=${id}`, new HttpHeaders());
            if (response) {
                response.subscribe((data: UserQuestPrev) => {
                    this.cacheService.setCache('userQuestPrev', data);
                    return data;
                })
            }
        } catch (e) {
            console.log('[API] getUserQuestPrev: ', e);
        }
        return undefined;
    }

    async getUserQuestWeekly(id: string = ""): Promise<UserQuestWeekly | undefined> {
        try {
            if (id === "") {
                const user = await this.getUserCredentials();
                if (user) {
                    id = user.id;
                }
            }

            const cache: UserQuestWeekly | null = await this.cacheService.getCache('userQuestToday');
            if (cache) {
                return cache;
            } else {
                this.cacheService.removeCache('userQuestToday');
            }

            const response = this.httpService.get(environment.apiUrl + `/api/user/getUserQuestWeekly?id=${id}`, new HttpHeaders());
            if (response) {
                response.subscribe((data: UserQuestWeekly) => {
                    this.cacheService.setCache('userQuestToday', data);
                    return data;
                })
            }
        } catch (e) {
            console.log('[API] getUserQuestWeekly: ', e);
        }
        return undefined;
    }

    // 사용자가 가입한 그룹과 모임 목록을 불러온다
    async getUserJoinList(id: string = ""): Promise<UserJoinList | undefined> {
        try {
            if (id === "") {
                const user = await this.getUserCredentials();
                if (user) {
                    id = user.id;
                }
            }
            const cache: UserJoinList | null = await this.cacheService.getCache('userJoinList');

            if (cache) {
                return cache;
            }

            const response = this.httpService.get(environment.apiUrl + `/api/user/getUserJoinList?id=${id}`, new HttpHeaders());

            if (response) {
                response.subscribe((data: UserJoinList) => {
                    this.cacheService.setCache('userJoinList', data);
                })
                return await this.cacheService.getCache('userJoinList');
            }
        } catch (e) {
            console.log('[API] getUserJoinList: ', e);
        }
        return undefined;
    }

    async getUserCredentials(): Promise<UserCredentials | undefined> {
        const cache = await this.cacheService.getCache('user');
        if (cache) {
            return cache;
        }
        this.cacheService.removeCache('user');
        this.cacheService.removeCache('userStatus');
        this.httpService.get('');
        return undefined;
    }

    async getUserStatus(id: string = ""): Promise<UserStatus | undefined> {
        try {
            if (id === "") {
                const user = await this.getUserCredentials();
                if (user) {
                    id = user.id;
                }
            }
            const cache = await this.cacheService.getCache('userStatus');

            if (cache) {
                return cache;
            }

            const response = this.httpService.get(environment.apiUrl + `/api/user/getUserStatus?id=${id}`, new HttpHeaders());
            if (response) {
                response.subscribe((data: UserStatus) => {
                    this.cacheService.setCache('userStatus', data);
                })
                return await this.cacheService.getCache('userStatus');
            }
        } catch (e) {
            console.log('[API] getUserStatus: ', e);
        }
        return undefined;
    }




    async setUserQuestRecord(id: string = "", group: string, userQuest: string[]): Promise<void> {
        if (id === "") {
            const user = await this.getUserCredentials();
            if (user) {
                id = user.id;
            }
        }
        let uq: UserQuestCur = await this.cacheService.getCache('userQuestCur');

        if (!uq || uq?.id !== id) {
            this.cacheService.removeCache('userQuestCur');
            await this.getUserQuestCur(id);
            return ;
        }

        uq.curQuestTotalList = uq.curQuestTotalList.filter((quest) => {
            if (userQuest.includes(quest.quest))
                quest.isSuccess = true;
        });
        this.httpService.post(environment.apiUrl + `/api/user/setUserQuestRecord`, {user: id, quest: uq}, new HttpHeaders());
        this.cacheService.setCache('userQuestCur', uq);
    }

    async setUserStatus(id: string = "", userStatus: UserStatus): Promise<void> {
        if (id === "") {
            const user = await this.getUserCredentials();
            if (user) {
                id = user.id;
            }
        }
        this.httpService.post(environment.apiUrl + `/api/user/setUserStatus`, {user: id, status: userStatus}, new HttpHeaders());
        this.cacheService.setCache('userStatus', userStatus);
    }

    async leaveGroup(id: string = "", group: string): Promise<void> {
        this.httpService.post(environment.apiUrl + `/api/user/leaveGroup`, {user: id, group: group}, new HttpHeaders());
        let userJoinList: UserJoinList | undefined = await this.cacheService.getCache('userJoinList');

        if (!userJoinList)
            userJoinList = await this.getUserJoinList(id);
        if (userJoinList) {
            userJoinList.joinList.forEach((join, index) => {
                if (join.groupname === group) {
                    userJoinList.joinList.splice(index, 1);
                }
            })
        }
        this.cacheService.setCache('userJoinList', userJoinList);
    }

    async leaveClub(id: string = "", group: string, club: string) {
        if (id === "") {
            const user = await this.getUserCredentials();
            if (user) {
                id = user.id;
            }
        }
        let userJoinList: UserJoinList | undefined = await this.cacheService.getCache('userJoinList');
        this.httpService.post(environment.apiUrl + `/api/user/leaveClub`, {user: id, group: group, club: club}, new HttpHeaders());

        if (!userJoinList)
            userJoinList = await this.getUserJoinList(id);
        if (userJoinList) {
            userJoinList.joinList.forEach((join) => {
                if (join.groupname === group) {
                    join.clubList = join.clubList.filter((clubName) => clubName !== club);
                }
            })
        }
        this.cacheService.setCache('userJoinList', userJoinList);
    }

    async joinGroup(id: string = "", group: string): Promise<void> {
        if (id === "") {
            const user = await this.getUserCredentials();
            if (user) {
                id = user.id;
            }
        }
        this.httpService.post(environment.apiUrl + `/api/user/joinGroup`, {user: id, group: group}, new HttpHeaders());
        let userJoinList: UserJoinList | undefined = await this.cacheService.getCache('userJoinList');

        if (!userJoinList)
            userJoinList = await this.getUserJoinList(id);
        if (userJoinList) {
            const groupExists = userJoinList.joinList.some(join => join.groupname === group);

            if (!groupExists) {
                userJoinList.joinList.push({ groupname: group, clubList: [] });
            }
        }
        this.cacheService.setCache('userJoinList', userJoinList);
    }

    async joinClub(id: string = "", group: string, clubList: string[]) {
        if (id === "") {
            const user = await this.getUserCredentials();
            if (user) {
                id = user.id;
            }
        }
        let userJoinList: UserJoinList | undefined = await this.cacheService.getCache('userJoinList');
        this.httpService.post(environment.apiUrl + `/api/user/joinClub`, {user: id, group: group, clubList: clubList}, new HttpHeaders());

        if (!userJoinList)
            userJoinList = await this.getUserJoinList(id);
        if (userJoinList) {
            userJoinList.joinList.forEach((join) => {
                if (join.groupname === group) {
                    clubList.forEach((club) => join.clubList.push(club));
                    join.clubList = [...new Set(join.clubList)];
                }
            })
            this.cacheService.setCache('userJoinList', userJoinList);
        }
    }

    async setUsername(id:string = "", username: string) {
        if (id === "") {
            const user = await this.getUserCredentials();
            if (user) {
                id = user.id;
            }
        }
        await this.httpService.post(environment.apiUrl + `/api/user/setUsername`, {user: id, username: username}, new HttpHeaders());

        let cacheUserCredentials: UserCredentials = await this.cacheService.getCache('user');
        let cacheUserStatus: UserStatus = await this.cacheService.getCache('userStatus');

        if (cacheUserCredentials) {
            cacheUserCredentials.name = username;
            this.cacheService.setCache('user', cacheUserCredentials);
        }
        if (cacheUserStatus) {
            cacheUserStatus.name = username;
            this.cacheService.setCache('userStatus', cacheUserStatus);
        }
    }
}