import { Injectable } from "@angular/core";
import { UserService } from "../../Core/Service/UserService";
import { GroupService } from "../../Core/Service/GroupService";
import { DataCacheService } from "../../Core/Service/DataCacheService";

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
        let stat: QuickStat[] = [
            {
                id: '1',
                title: '오늘 달성률',
                value: '0',
                change: this.getGoalRateMessage(0),
                trend: 0 >= 50 ? 'up' : 'down',
                icon: 'trending_up',
                color: '#48bb78'
            },
            {
                id: '2',
                title: '참여 모임',
                value: "0",
                change: '친구들이 선생님을 기다리고 있습니다',
                trend: 'up',
                icon: 'group',
                color: '#4299e1'
            },
            {
                id: '3',
                title: '연속 달성',
                value: "0",
                change: '이만큼이나 하셨군요 훌륭합니다!',
                trend: 'up',
                icon: 'repeat',
                color: '#f6ad55'
            }
        ]
        const userInfo = await this.userService.getUserJoinList();
        const userQuestCur = await this.userService.getUserQuestCur();
        const userQuestContinuous = await this.userService.getUserQuestContinuous();

        if (!(userInfo && userQuestCur && userQuestContinuous))
            return stat;
        let curQuestSuccessNum = 0;
        console.log(userQuestCur);
        userQuestCur.curQuestTotalList.forEach((quest) => {
            curQuestSuccessNum += quest.isSuccess ? 1 : 0;
        });
        const continuousSuccess = userQuestContinuous.continuousSuccessQuestList.days;
        const rate = Math.floor(userQuestContinuous.continuousSuccessQuestList.successQuestNum
            / userQuestContinuous.continuousSuccessQuestList.successQuestNum * 100);
        stat[0].value = `${rate}%`;
        stat[0].change = this.getGoalRateMessage(rate);
        stat[0].trend = rate >= 50 ? 'up' : 'down';
        stat[1].value = `${userInfo.joinList.length}`;
        stat[2].value = `${continuousSuccess}`;
        return stat;
    }

    // [Fix] : 추후 고쳐야 함
    async getRecommendedChallenge(): Promise<RecommendedChallenge[]> {
        const userQuestCur = await this.userService.getUserQuestCur();
        let recommendedChallenge: RecommendedChallenge[] = [
            {
                id: "0",
                title: "챌린지",
                description: "챌린지 설명",
                participants: 0,
                difficulty: "easy",
                category: "친구",
                image: "💪"
            }
        ];
        let id = 0;

        if (!userQuestCur || userQuestCur.curQuestTotalList === undefined)
            return recommendedChallenge;
        userQuestCur.curQuestTotalList.forEach((quest) => {
            if (!quest.isSuccess) {
                this.groupService.getGroupInfo(quest.group).then((groupInfo) => {
                    if (groupInfo) {
                        let participants = 0;
                        groupInfo.questList.forEach((q, index) => {
                            if (q === quest.quest) {
                                participants = groupInfo.questSuccessNum[index];
                            }
                        })
                        let diff = Math.floor(participants / groupInfo.memberNum) * 100;
                        recommendedChallenge.push({
                            id: `${id++}`,
                            title: quest.quest,
                            description: "",
                            participants: participants,
                            difficulty: diff >= 75 ? "easy" : diff >= 50 ? "medium" : "hard",
                            category: quest.group,
                            image: "💪"
                        });
                    }
                });
            }
        });
        return recommendedChallenge.slice(0, 4);
    }

    getGoalRateMessage(rate: number) {
        if (rate === 100)
            return "당신이 넘버원입니다";
        if (rate >= 75)
            return "이제 정상까지 얼마 남지 않았습니다!";
        if (rate >= 50)
            return "오늘도 갓생을 살고 계시군요!"
        if (rate >= 25)
            return "절반까지 얼마 안 남았습니다!";
        return "시작이 반입니다! 화이팅!";
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