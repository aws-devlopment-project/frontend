import { Injectable } from "@angular/core";
import { UserService } from "../../Core/Service/UserService";
import { GroupService } from "../../Core/Service/GroupService";

interface QuickStat {
  id: string;
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'stable';
  icon: string;
  color: string;
}

interface RecommendedChallenge {
  id: string;
  title: string;
  description: string;
  participants: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  image: string;
}

@Injectable({
    providedIn: 'platform'
})
export class HomeDashboardService {
    constructor(private userService: UserService, private groupService: GroupService) {
    }

    async getTodayBoard(): Promise<QuickStat[]> {
        // Initialize the stat array with default values first
        let stat: QuickStat[] = [
            {
                id: '1',
                title: '오늘 달성률',
                value: '0%',
                change: '시작이 반입니다! 화이팅!',
                trend: 'stable',
                icon: 'trending_up',
                color: '#3182ce'
            },
            {
                id: '2',
                title: '참여 모임',
                value: '0개',
                change: '첫 모임 참여를 기다리고 있어요!',
                trend: 'stable',
                icon: 'groups',
                color: '#4299e1'
            },
            {
                id: '3',
                title: '연속 달성',
                value: '0일',
                change: '오늘부터 새로운 시작!',
                trend: 'stable',
                icon: 'local_fire_department',
                color: '#f6ad55'
            }
        ];

        try {
            const userInfo = await this.userService.getUserJoin();
            const userQuestCur = await this.userService.getUserQuestCur();
            const userQuestContinuous = await this.userService.getUserQuestContinuous();

            // If we can't get the required data, return default stats
            if (!(userInfo && userQuestCur && userQuestContinuous)) {
                console.warn('Missing required data for getTodayBoard, returning default stats');
                return stat;
            }

            // Calculate completion rate
            let curQuestSuccessNum = 0;
            let totalQuests = 0;

            if (userQuestCur.curQuestTotalList && userQuestCur.curQuestTotalList.length > 0) {
                totalQuests = userQuestCur.curQuestTotalList.length;
                userQuestCur.curQuestTotalList.forEach((quest) => {
                    curQuestSuccessNum += quest.success ? 1 : 0;
                });
            }

            // Calculate rate safely
            let rate = 0;
            if (totalQuests > 0) {
                rate = Math.floor((curQuestSuccessNum / totalQuests) * 100);
            } else if (userQuestContinuous.continuousSuccessQuestList?.successQuestNum && 
                       userQuestContinuous.continuousSuccessQuestList?.totalQuestNum) {
                rate = Math.floor(
                    (userQuestContinuous.continuousSuccessQuestList.successQuestNum / 
                     userQuestContinuous.continuousSuccessQuestList.totalQuestNum) * 100
                );
            }

            // Get continuous success days safely
            const continuousSuccess = userQuestContinuous.continuousSuccessQuestList?.days || 0;

            // Get number of joined groups safely
            const joinedGroupsCount = userInfo.joinList?.length || 0;

            // Update stats with actual data
            stat[0].value = `${rate}%`;
            stat[0].change = this.getGoalRateMessage(rate);
            stat[0].trend = rate >= 50 ? 'up' : rate >= 25 ? 'stable' : 'down';

            stat[1].value = `${joinedGroupsCount}개`;
            stat[1].change = joinedGroupsCount > 0 ? 
                `${joinedGroupsCount}개 모임에서 활동 중` : 
                '첫 모임 참여를 기다리고 있어요!';
            stat[1].trend = joinedGroupsCount > 0 ? 'up' : 'stable';

            stat[2].value = `${continuousSuccess}일`;
            stat[2].change = continuousSuccess >= 7 ? 
                '🔥 일주일 연속 달성!' : 
                continuousSuccess > 0 ?
                '좋은 페이스를 유지하고 있어요!' :
                '오늘부터 새로운 시작!';
            stat[2].trend = continuousSuccess > 0 ? 'up' : 'stable';

        } catch (error) {
            console.error('Error in getTodayBoard:', error);
            // Return default stats on error
        }

        return stat;
    }

    // 추천 챌린지 - 실제 사용자 데이터에서만 생성
    async getRecommendedChallenge(): Promise<RecommendedChallenge[]> {
        let recommendedChallenge: RecommendedChallenge[] = [];
        
        try {
            const userQuestCur = await this.userService.getUserQuestCur();
            let id = 0;

            // 사용자의 현재 퀘스트 데이터가 없으면 빈 배열 반환
            if (!userQuestCur || !userQuestCur.curQuestTotalList || userQuestCur.curQuestTotalList.length === 0) {
                console.log('No current quests found, returning empty recommended challenges');
                return [];
            }

            // 미완성 퀘스트만 필터링
            const incompleteTasks = userQuestCur.curQuestTotalList.filter(quest => !quest.success);
            
            if (incompleteTasks.length === 0) {
                console.log('All current quests are completed, no recommendations needed');
                return [];
            }

            // Promise.all로 비동기 작업 처리
            const challengePromises = incompleteTasks.slice(0, 4).map(async (quest, index): Promise<RecommendedChallenge | null> => {
                try {
                    const groupInfo = await this.groupService.getGroupInfo(quest.group);
                    
                    if (groupInfo) {
                        let participants = 0;
                        groupInfo.questList.forEach((q, qIndex) => {
                            if (q === quest.quest && groupInfo.questSuccessNum && groupInfo.questSuccessNum[qIndex]) {
                                participants = groupInfo.questSuccessNum[qIndex];
                            }
                        });

                        let completionRate = groupInfo.memberNum > 0 ? 
                            Math.floor((participants / groupInfo.memberNum) * 100) : 0;

                        return {
                            id: `${id + index}`,
                            title: quest.quest,
                            description: this.generateText(completionRate, quest.group),
                            participants: participants,
                            difficulty: completionRate >= 75 ? "easy" : completionRate >= 50 ? "medium" : "hard",
                            category: quest.group,
                            image: "💪"
                        };
                    }
                    
                    // groupInfo가 없는 경우 null 반환
                    return null;
                } catch (error) {
                    console.error(`Error processing quest for group ${quest.group}:`, error);
                    return null;
                }
            });

            const results = await Promise.all(challengePromises);
            recommendedChallenge = results.filter(challenge => challenge !== null) as RecommendedChallenge[];

            console.log(`Generated ${recommendedChallenge.length} recommended challenges from user data`);

        } catch (error) {
            console.error('Error in getRecommendedChallenge:', error);
            // 에러가 발생해도 빈 배열 반환 (기본 챌린지 제공하지 않음)
        }

        return recommendedChallenge;
    }

    getGoalRateMessage(rate: number): string {
        if (rate === 100)
            return "당신이 넘버원입니다! 🏆";
        if (rate >= 75)
            return "이제 정상까지 얼마 남지 않았습니다! ⭐";
        if (rate >= 50)
            return "오늘도 갓생을 살고 계시군요! 💪";
        if (rate >= 25)
            return "절반까지 얼마 안 남았습니다! 📈";
        return "시작이 반입니다! 화이팅! 🌱";
    }

    generateText(difficulty: number, groupname: string): string {
        if (difficulty >= 75) {
            return `${groupname}에 속한 많은 사람들이 끝을 향해 가고 있습니다. 같이 달리시죠!`;
        }
        if (difficulty >= 50) {
            return `${groupname}에 속한 분들 모두가 열심히 참여하고 있습니다`;
        }
        if (difficulty >= 25) {
            return `${groupname}에서 서서히 움직임이 보입니다`;
        } else {
            return `${groupname}의 선생님이라면 무조건 클리어할 수 있습니다`;
        }
    }
}