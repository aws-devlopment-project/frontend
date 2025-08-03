import { Injectable } from "@angular/core";
import { GroupService } from "../../Core/Service/GroupService";
import { Group } from "../../Core/Models/group";
import { Quest, Stat } from "../Models/GroupDashboardModels";
import { UserService } from "../../Core/Service/UserService";

@Injectable({
    providedIn: 'platform'
})
export class GroupDashboardService {
    constructor(private groupService: GroupService, private userService: UserService) {
    }

    async getGroupData(groupname: string): Promise<Group | undefined> {
        const group = await this.groupService.getGroupInfo(groupname);
        return group;
    }

    processingQuest(group: Group | undefined): Quest[] {
        if (!group || !group.questList || !group.questSuccessNum || group.memberNum === 0) {
            return [];
        }

        return group.questList.map((questTitle, index) => {
            const successCount = group.questSuccessNum[index] || 0;
            const progress = Math.min(Math.floor((successCount / group.memberNum) * 100), 100);
            return {
                id: (index + 1).toString(),
                title: questTitle,
                description: `${questTitle} 퀘스트를 완료하세요`,
                icon: this.getQuestIcon(questTitle),
                progress: progress,
                status: progress >= 100 ? 'completed' 
                    : progress > 0 ? 'in-progress' 
                    : 'not-started'
                } as Quest;
            });
    }

    private getQuestIcon(questTitle: string): string {
        const iconMap: { [key: string]: string } = {
            'a': '💪',
            'b': '📚', 
            'c': '💧',
            // 더 많은 매핑 추가 가능
        };
    
        return iconMap[questTitle] || '⭐';
    }

    processingStat(group: Group | undefined): Stat[] {
        if (!group || !group.questList || !group.questSuccessNum || group.memberNum === 0) {
            console.log(group);
            return [];
        }
        let totalValue = 0;
        let statList: Stat[] = [];
        group.questSuccessNum.forEach((num) => {
            totalValue += num;
        });
        for (let i = 0; i < 3; i++) {
            let stat: Stat = {
                id: (i + 1).toString(),
                label: i == 0 ? '전체 멤버'
                    : i == 1 ? '퀘스트 달성률'
                    : '소모임 수',
                value: i == 0 ? group.memberNum
                    : i == 1 ? Math.floor(totalValue / (group.memberNum * 3) * 100)
                    : group.clubList.length,
                icon: i == 0 ? 'group'
                    : i == 1 ? 'thumb_up'
                    : 'star',
                unit: i == 0 ? '명'
                    : i == 1 ? '%'
                    : '개'
            }
            statList.push(stat);
        }
        return statList;
    }

    processingChallenge(group: Group) {

    }

    questClear(username: string, groupname: string | null, clearQuests: Quest[]) {
        let questList: string[] = [];
        clearQuests.forEach((quest) => {
            if (quest.status === 'completed')
                questList.push(quest.title);
        });
        if (groupname) {
            this.groupService.questSuccess(groupname, username, questList);
            this.userService.setUserQuestRecord(username, groupname, questList);
        }
    }
}