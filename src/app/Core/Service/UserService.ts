import { Injectable } from "@angular/core";
import { HttpService } from "./HttpService";
import { HttpHeaders } from "@angular/common/http";
import { DataCacheService } from "./DataCacheService";
import { UserCredentials, UserJoin, UserStatus } from "../Models/user";
import { UserQuestContinuous, UserQuestCur, UserQuestPrev, UserQuestWeekly } from "../Models/user";
import { createUserQuestContinuous, createUserJoin, createUserCredentials, createUserQuestCur, createUserQuestPrev, createUserQuestWeekly, createUserStatus } from "../Models/user";
import { Router } from "@angular/router";
import { firstValueFrom, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Group } from "../Models/group";
import { LoginService } from "../../Auth/Service/LoginService";
import { environment } from "../../../environments/environtment";

@Injectable({
    providedIn: 'root'
})
export class UserService {

    constructor(
        private httpService: HttpService,
        private cacheService: DataCacheService,
        private router: Router,
        private loginService: LoginService
    ) {}

    serverUrl: string = "https://server.teamnameless.click";

    // === 개선된 사용자 인증 정보 조회 ===
    async getUserCredentials(): Promise<UserCredentials | null> {
        try {
            const cache: UserCredentials | null = this.cacheService.getCache('user');
            if (cache) {
                return cache;
            }
            
            // 캐시가 없으면 인증 실패로 처리
            this.handleAuthFailure();
            return null;
        } catch (error) {
            console.error('Error getting user credentials:', error);
            this.handleAuthFailure();
            return null;
        }
    }

    // === 개선된 사용자 상태 조회 ===
    async getUserStatus(id: string = ""): Promise<UserStatus | null> {
        try {
            // ID 확인
            if (!id) {
                const user: UserCredentials | null = await this.getUserCredentials();
                if (!user) {
                    return null;
                }
                id = user.id;
            }

            // 캐시 확인
            const cache: UserStatus | null = this.cacheService.getCache('userStatus');
            if (cache && cache.id === id) {
                return cache;
            }

            // API 호출
            const url = this.serverUrl + `/api/user/getUserStatus?email=${id}`;
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
            
            const response = await firstValueFrom(
                this.httpService.get<UserStatus>(url, createUserStatus, headers).pipe(
                    tap(data => {
                        this.cacheService.setCache('userStatus', data);
                    }),
                    catchError(error => {
                        console.error('[API] getUserStatus error:', error);
                        this.cacheService.removeCache('userStatus');
                        return throwError(error);
                    })
                )
            );

            return response;
        } catch (error) {
            console.error('[API] getUserStatus failed:', error);
            return null;
        }
    }

    // === 개선된 사용자 가입 목록 조회 ===
    async getUserJoin(id: string = ""): Promise<UserJoin | null> {
        try {
            // ID 확인
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) {
                    return null;
                }
                id = user.id;
            }

            // 캐시 확인
            const cache: UserJoin | null = this.cacheService.getCache('userJoin');
            if (cache && cache.id === id) {
                return cache;
            }

            // API 호출  
            const url = this.serverUrl + `/api/user/getUserJoin?email=${id}`;
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            const response = await firstValueFrom(
                this.httpService.get<UserJoin>(url, createUserJoin, headers).pipe(
                    tap(data => {
                        // ID 정보 추가하여 캐시
                        const dataWithId = { ...data, id };
                        this.cacheService.setCache('userJoin', dataWithId);
                    }),
                    catchError(error => {
                        console.error('[API] getUserJoin error:', error);
                        this.cacheService.removeCache('userJoin');
                        return throwError(error);
                    })
                )
            );

            return response;
        } catch (error) {
            console.error('[API] getUserJoin failed:', error);
            return null;
        }
    }

    // === 개선된 Quest 관련 메서드들 ===
    async getUserQuestCur(id: string = ""): Promise<UserQuestCur | null> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return null;
                id = user.id;
            }

            const cache: UserQuestCur | null = this.cacheService.getCache('userQuestCur');
            if (cache && cache.id === id) {
                return cache;
            }

            const url = this.serverUrl + `/api/user/getUserQuestCur?email=${id}`;
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            const response = await firstValueFrom(
                this.httpService.get<UserQuestCur>(url, createUserQuestCur, headers).pipe(
                    tap(data => {
                        if (data.id === 'default')
                            this.cacheService.setCache('userQuestCur', data, 60 * 3600);
                        else
                            this.cacheService.setCache('userQuestCur', data);
                    }),
                    catchError(error => {
                        console.error('[API] getUserQuestCur error:', error);
                        return throwError(error);
                    })
                )
            );
            return response;
        } catch (error) {
            console.error('[API] getUserQuestCur failed:', error);
            return null;
        }
    }

    async getUserQuestContinuous(id: string = ""): Promise<UserQuestContinuous | null> {
        try {
            if (!id) {
                const user: UserCredentials | null = await this.getUserCredentials();
                if (!user) return null;
                id = user.id;
            }

            const cache: UserQuestContinuous | null = this.cacheService.getCache('userQuestContinuous');
            if (cache && cache.id === id) {
                return cache;
            }

            const url = this.serverUrl + `/api/user/getUserQuestContinuous?email=${id}`;
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            const response = await firstValueFrom(
                this.httpService.get<UserQuestContinuous>(url, createUserQuestContinuous, headers).pipe(
                    tap(data => {
                        if (data.id === 'default')
                            this.cacheService.setCache('userQuestContinuous', data, 60 * 3600);
                        else
                            this.cacheService.setCache('userQuestContinuous', data);
                    }),
                    catchError(error => {
                        console.error('[API] getUserQuestContinuous error:', error);
                        return throwError(error);
                    })
                )
            );

            return response;
        } catch (error) {
            console.error('[API] getUserQuestContinuous failed:', error);
            return null;
        }
    }

    async getUserQuestPrev(id: string = ""): Promise<UserQuestPrev | null> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return null;
                id = user.id;
            }

            const cache: UserQuestPrev | null = this.cacheService.getCache('userQuestPrev');
            if (cache && cache.id === id) {
                return cache;
            }

            const url = this.serverUrl + `/api/user/getUserQuestPrev?email=${id}`;
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            const response = await firstValueFrom(
                this.httpService.get<UserQuestPrev>(url, createUserQuestPrev, headers).pipe(
                    tap(data => {
                        if (data.id === 'default')
                            this.cacheService.setCache('userQuestPrev', data, 60 * 3600);
                        else
                            this.cacheService.setCache('userQuestPrev', data);
                    }),
                    catchError(error => {
                        console.error('[API] getUserQuestPrev error:', error);
                        return throwError(error);
                    })
                )
            );

            return response;
        } catch (error) {
            console.error('[API] getUserQuestPrev failed:', error);
            return null;
        }
    }

    async getUserQuestWeekly(id: string = ""): Promise<UserQuestWeekly | null> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return null;
                id = user.id;
            }

            const cache: UserQuestWeekly | null = this.cacheService.getCache('userQuestWeekly');
            if (cache && cache.id === id) {
                return cache;
            }

            const url = this.serverUrl + `/api/user/getUserQuestWeekly?email=${id}`;
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            const response = await firstValueFrom(
                this.httpService.get<UserQuestWeekly>(url, createUserQuestWeekly, headers).pipe(
                    tap(data => {
                        if (data.id === 'default')
                            this.cacheService.setCache('userQuestWeekly', data, 60 * 3600);
                        else
                            this.cacheService.setCache('userQuestWeekly', data);
                    }),
                    catchError(error => {
                        console.error('[API] getUserQuestWeekly error:', error);
                        return throwError(error);
                    })
                )
            );

            return response;
        } catch (error) {
            console.error('[API] getUserQuestWeekly failed:', error);
            return null;
        }
    }

    async setUserStatus(id: string = "", userStatus: UserStatus): Promise<boolean> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return false;
                id = user.id;
            }

            const url = this.serverUrl + `/api/user/setUserStatus`;
            const body = { user: id, status: userStatus };
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            await firstValueFrom(
                this.httpService.post(url, body, headers).pipe(
                    tap(() => {
                        this.cacheService.setCache('userStatus', userStatus);
                    }),
                    catchError(error => {
                        console.error('[API] setUserStatus error:', error);
                        return throwError(error);
                    })
                )
            );

            return true;
        } catch (error) {
            console.error('[API] setUserStatus failed:', error);
            return false;
        }
    }

    async setUsername(id: string = "", username: string): Promise<boolean> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return false;
                id = user.id;
            }

            const url = this.serverUrl + `/api/user/setUsername`;
            const body = { user: id, username: username };
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            await firstValueFrom(
                this.httpService.post(url, body, headers).pipe(
                    catchError(error => {
                        console.error('[API] setUsername error:', error);
                        return throwError(error);
                    })
                )
            );

            // 캐시 업데이트
            const cacheUserCredentials: UserCredentials | null = this.cacheService.getCache('user');
            const cacheUserStatus: UserStatus | null = this.cacheService.getCache('userStatus');

            if (cacheUserCredentials) {
                cacheUserCredentials.name = username;
                this.cacheService.setCache('user', cacheUserCredentials);
            }
            if (cacheUserStatus) {
                cacheUserStatus.name = username;
                this.cacheService.setCache('userStatus', cacheUserStatus);
            }

            return true;
        } catch (error) {
            console.error('[API] setUsername failed:', error);
            return false;
        }
    }

    // === 개선된 그룹/클럽 관리 메서드들 ===
    async joinGroup(id: string = "", groupId: number, group: string): Promise<boolean> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return false;
                id = user.id;
            }

            const url = this.serverUrl + `/api/user/joinGroup`;
            const body = { user: id, group: group };
            console.log("joinGroup: ", body);
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            await firstValueFrom(
                this.httpService.post(url, body, headers).pipe(
                    catchError(error => {
                        console.error('[API] joinGroup error:', error);
                        return throwError(error);
                    })
                )
            );

            // 캐시 업데이트
            await this.updateJoinListCache(id, (joinList) => {
                const groupExists = joinList.joinList.some(join => join.groupname === group);
                if (!groupExists) {
                    joinList.joinList.push({ groupId: groupId, groupname: group, clubList: [] });
                }
                return joinList;
            });

            return true;
        } catch (error) {
            console.error('[API] joinGroup failed:', error);
            return false;
        }
    }

    async leaveGroup(id: string = "", group: string): Promise<boolean> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return false;
                id = user.id;
            }

            const url = this.serverUrl + `/api/user/leaveGroup`;
            const body = { user: id, group: group };
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            await firstValueFrom(
                this.httpService.post(url, body, headers).pipe(
                    catchError(error => {
                        console.error('[API] leaveGroup error:', error);
                        return throwError(error);
                    })
                )
            );

            // 캐시 업데이트
            await this.updateJoinListCache(id, (joinList) => {
                joinList.joinList = joinList.joinList.filter(join => join.groupname !== group);
                return joinList;
            });

            return true;
        } catch (error) {
            console.error('[API] leaveGroup failed:', error);
            return false;
        }
    }

    async joinClub(id: string = "", group: string, clubList: string[]): Promise<boolean> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return false;
                id = user.id;
            }

            const url = this.serverUrl + `/api/user/joinClub`;
            const body = { user: id, group: group, clubList: clubList };
            console.log("joinClub: " + body.user, body.group, body.clubList);
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            await firstValueFrom(
                this.httpService.post(url, body, headers).pipe(
                    catchError(error => {
                        console.error('[API] joinClub error:', error);
                        return throwError(error);
                    })
                )
            );

            // 캐시 업데이트
            await this.updateJoinListCache(id, (joinList) => {
                const groupIndex = joinList.joinList.findIndex(join => join.groupname === group);
                if (groupIndex !== -1) {
                    // 중복 제거하여 추가
                    const existingClubs = joinList.joinList[groupIndex].clubList;
                    const newClubs = clubList.filter(club => !existingClubs.some(clubF => clubF.name === club));
                    const groupInfo: Group | null = this.cacheService.getCache(group);
                    if (groupInfo) {
                        const newClubInfo = groupInfo.clubList.filter(club => newClubs.includes(club.name));
                        newClubInfo.forEach(club => {
                            joinList.joinList[groupIndex].clubList.push({createdAt: new Date(), updatedAt: new Date(), clubId: club.clubId, name: club.name});
                        });
                    }
                }
                return joinList;
            });

            return true;
        } catch (error) {
            console.error('[API] joinClub failed:', error);
            return false;
        }
    }

    async leaveClub(id: string = "", group: string, club: string): Promise<boolean> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return false;
                id = user.id;
            }

            const url = this.serverUrl + `/api/user/leaveClub`;
            const body = { user: id, group: group, club: club };
            const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

            await firstValueFrom(
                this.httpService.post(url, body, headers).pipe(
                    catchError(error => {
                        console.error('[API] leaveClub error:', error);
                        return throwError(error);
                    })
                )
            );

            // 캐시 업데이트
            await this.updateJoinListCache(id, (joinList) => {
                const groupIndex = joinList.joinList.findIndex(join => join.groupname === group);
                if (groupIndex !== -1) {
                    joinList.joinList[groupIndex].clubList = 
                        joinList.joinList[groupIndex].clubList.filter(clubs => clubs.name !== club);
                }
                return joinList;
            });

            return true;
        } catch (error) {
            console.error('[API] leaveClub failed:', error);
            return false;
        }
    }

    async setUserAvatar(id: string = "", imageData: string): Promise<boolean> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return false;
                id = user.id;
            }

            // base64 헤더 제거 (data:image/jpeg;base64, 부분)
            const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;

            const url = this.serverUrl + `/api/user/setUserAvatar`;
            const payload = {
                user: id,
                avatar: base64Data
            };

            await firstValueFrom(
                this.httpService.post(url, payload, 
                    new HttpHeaders({ 'Content-Type': 'application/json' })
                ).pipe(
                    tap(() => {
                        // 캐시 업데이트
                        this.updateUserAvatarInCache(id, imageData);
                    }),
                    catchError(error => {
                        console.error('[API] setUserAvatar error:', error);
                        return throwError(error);
                    })
                )
            );

            return true;
        } catch (error) {
            console.error('[API] setUserAvatar failed:', error);
            return false;
        }
    }

    /**
     * 아바타 리셋 (기본 아바타로)
     */
    async resetUserAvatar(id: string = ""): Promise<boolean> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) return false;
                id = user.id;
            }

            const url = this.serverUrl + `/api/user/resetUserAvatar`;
            const payload = { user: id };

            await firstValueFrom(
                this.httpService.post(url, payload, 
                    new HttpHeaders({ 'Content-Type': 'application/json' })
                ).pipe(
                    tap(() => {
                        this.updateUserAvatarInCache(id, '');
                    }),
                    catchError(error => {
                        console.error('[API] resetUserAvatar error:', error);
                        return throwError(error);
                    })
                )
            );

            return true;
        } catch (error) {
            console.error('[API] resetUserAvatar failed:', error);
            return false;
        }
    }

    /**
     * 이미지 파일을 base64로 변환하여 업로드
     */
    async uploadAvatarFile(id: string = "", file: File): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target?.result as string;
                    const result = await this.setUserAvatar(id, base64Data);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * 캐시된 아바타 정보 업데이트
     */
    private updateUserAvatarInCache(userId: string, avatarData: string): void {
        try {
            const cacheUserStatus: UserStatus | null = this.cacheService.getCache('userStatus');
            if (cacheUserStatus && cacheUserStatus.id === userId) {
                cacheUserStatus.avatar = avatarData || '/assets/images/default-avatar.png';
                this.cacheService.setCache('userStatus', cacheUserStatus);
            }
        } catch (error) {
            console.error('Error updating avatar in cache:', error);
        }
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

    // === 헬퍼 메서드들 ===
    private async updateJoinListCache(
        id: string, 
        updateFn: (joinList: UserJoin) => UserJoin
    ): Promise<void> {
        try {
            let userJoin: UserJoin | null = this.cacheService.getCache('userJoin');
            
            if (!userJoin || userJoin.id !== id) {
                userJoin = await this.getUserJoin(id);
            }

            if (userJoin) {
                const updatedJoinList = updateFn(userJoin);
                this.cacheService.setCache('userJoin', updatedJoinList);
            }
        } catch (error) {
            console.error('Error updating join list cache:', error);
            // 캐시 업데이트 실패 시 캐시 무효화
            this.cacheService.removeCache('userJoin');
        }
    }

    private handleAuthFailure(): void {
        console.warn('Authentication failed, clearing session and redirecting');
        this.cacheService.removeCache('user');
        this.cacheService.removeCache('userStatus');
        this.cacheService.removeCache('userJoin');
        this.router.navigate(['/']);
    }

    // === 캐시 관리 메서드들 ===
    clearSelectUserCache(cacheName: string) {
        this.cacheService.removeCache(cacheName);
    }
    
    clearUserCache(): void {
        this.cacheService.removeCache('user');
        this.cacheService.removeCache('userStatus');
        this.cacheService.removeCache('userJoin');
        this.cacheService.removeCache('userQuestCur');
        this.cacheService.removeCache('userQuestContinuous');
        this.cacheService.removeCache('userQuestPrev');
        this.cacheService.removeCache('userQuestWeekly');
    }

    clearUserQuestCache(): void {
        this.cacheService.removeCache('userQuestCur');
        this.cacheService.removeCache('userQuestContinuous');
        this.cacheService.removeCache('userQuestPrev');
        this.cacheService.removeCache('userQuestWeekly');
    }

    async refreshAllUserData(id: string = ""): Promise<{
        credentials: UserCredentials | null;
        status: UserStatus | null;
        joinList: UserJoin | null;
    }> {
        try {
            if (!id) {
                const user = await this.getUserCredentials();
                if (!user) {
                    return { credentials: null, status: null, joinList: null };
                }
                id = user.id;
            }

            // 모든 캐시 무효화
            this.clearUserCache();

            // 병렬로 데이터 새로고침
            const [credentials, status, joinList] = await Promise.allSettled([
                this.getUserCredentials(),
                this.getUserStatus(id),
                this.getUserJoin(id)
            ]);

            const result = {
                credentials: credentials.status === 'fulfilled' ? credentials.value : null,
                status: status.status === 'fulfilled' ? status.value : null,
                joinList: joinList.status === 'fulfilled' ? joinList.value : null
            };

            console.log('All user data refreshed:', result);
            return result;
        } catch (error) {
            console.error('Error refreshing all user data:', error);
            return { credentials: null, status: null, joinList: null };
        }
    }

    async departUser(id: string) {
        try {
            const url = this.serverUrl + `/api/user`;
            const val = await this.loginService.deleteCurrentUser();

            if (val) {
                await firstValueFrom(
                    this.httpService.delete(url
                    ).pipe(
                        catchError(error => {
                            console.error('[API] departUser error:', error);
                            return throwError(error);
                        })
                    )
                );
            }

            this.clearUserCache();
            this.router.navigate(['/']);
        } catch (error) {
            console.error('[API] departUser failed:', error);
        }
    }

    // === 유효성 검사 메서드들 ===
    isValidUser(user: any): user is UserCredentials {
        return user && 
               typeof user.id === 'string' && 
               typeof user.name === 'string' &&
               typeof user.accessToken === 'string';
    }

    isValidUserStatus(status: any): status is UserStatus {
        return status && 
               typeof status.id === 'string' && 
               typeof status.name === 'string';
    }

    isValidUserJoin(joinList: any): joinList is UserJoin {
        return joinList && 
               Array.isArray(joinList.joinList) &&
               joinList.joinList.every((item: any) => 
                   typeof item.groupname === 'string' && 
                   Array.isArray(item.clubList)
               );
    }
}