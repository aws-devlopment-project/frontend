import { Injectable } from "@angular/core";
import { GroupService } from "../../Core/Service/GroupService";
import { Group } from "../../Core/Models/group";
import { Quest, Stat } from "../Models/GroupDashboardModels";
import { UserService } from "../../Core/Service/UserService";
import { UserQuestCur } from "../../Core/Models/user";

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

    async getUserQuestData(username: string): Promise<UserQuestCur | null> {
        const user = await this.userService.getUserQuestCur(username);
        return user;
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
        // 챌린지 처리 로직 (필요시 구현)
    }

    // 기존 questClear 메서드 (호환성 유지)
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

    // 새로 추가된 메서드: 피드백과 함께 퀘스트 완료 처리
    async questSuccessWithFeedback(
        groupName: string, 
        username: string, 
        questList: string[], 
        feedbackText?: string,
        isLike?: boolean
    ): Promise<boolean> {
        try {
            console.log('Processing quest success with feedback:', {
                groupName,
                username,
                questList,
                hasFeedback: !!feedbackText
            });

            // 1. 기존 questSuccess 호출
            const questSuccessResult = await this.groupService.questSuccess(groupName, username, questList);
            
            // 2. 사용자 퀘스트 기록 업데이트
            const userQuestResult = await this.userService.setUserQuestRecord(username, groupName, questList);

            // 3. 피드백이 있는 경우 추가 처리
            if (feedbackText && feedbackText.trim().length > 0) {
                await this.processFeedbackWithQuestSuccess(
                    groupName, 
                    username, 
                    questList, 
                    feedbackText.trim()
                );
            }

            console.log('Quest success with feedback completed successfully');
            return questSuccessResult && userQuestResult;

        } catch (error) {
            console.error('Error in questSuccessWithFeedback:', error);
            return false;
        }
    }

    // 피드백과 함께 퀘스트 완료 데이터 통합 처리
    private async processFeedbackWithQuestSuccess(
        groupName: string,
        username: string,
        questList: string[],
        feedbackText: string
    ): Promise<void> {
        try {
            // 피드백 데이터를 questSuccess와 함께 전송하는 확장된 API 호출
            // 실제 구현에서는 GroupService에 새로운 메서드를 추가하거나
            // 기존 questSuccess 메서드를 확장해야 할 수 있습니다.
            
            const feedbackData = {
                group: groupName,
                user: username,
                questList: questList,
                feedback: feedbackText,
                timestamp: new Date().toISOString(),
                metadata: {
                    source: 'dashboard',
                    questCount: questList.length
                }
            };

            // 피드백과 함께 서버에 전송
            await this.sendQuestSuccessWithFeedback(feedbackData);

            console.log('Feedback integrated with quest success:', {
                questCount: questList.length,
                feedbackLength: feedbackText.length,
                user: username
            });

        } catch (error) {
            console.error('Error processing feedback with quest success:', error);
            // 피드백 처리 실패해도 퀘스트 완료는 이미 처리되었으므로 에러를 던지지 않음
        }
    }

    // 실제 API 호출 메서드 (GroupService 확장 필요)
    private async sendQuestSuccessWithFeedback(data: any): Promise<boolean> {
        try {
            // 실제 구현에서는 GroupService에 questSuccessWithFeedback 메서드를 추가하거나
            // 별도의 피드백 전송 API를 호출해야 합니다.
            
            // 예시: 확장된 questSuccess API 호출
            // return await this.groupService.questSuccessWithFeedback(data);
            
            // 또는 별도의 피드백 API 호출
            // await this.groupService.sendQuestFeedback(data);
            
            // 현재는 로깅만 수행 (실제 API 구현 필요)
            console.log('Would send quest success with feedback to server:', data);
            
            // 시뮬레이션: 성공으로 처리
            return true;

        } catch (error) {
            console.error('Error sending quest success with feedback:', error);
            return false;
        }
    }

    // 피드백 데이터 검증
    validateFeedback(feedbackText: string): { isValid: boolean; message?: string } {
        const trimmed = feedbackText.trim();
        
        if (trimmed.length < 5) {
            return {
                isValid: false,
                message: '피드백은 최소 5자 이상 입력해주세요.'
            };
        }
        
        if (trimmed.length > 200) {
            return {
                isValid: false,
                message: '피드백은 최대 200자까지 입력 가능합니다.'
            };
        }

        // 금지어 체크 (필요시 확장)
        const forbiddenWords = ['스팸', '광고', '도배'];
        const containsForbiddenWord = forbiddenWords.some(word => 
            trimmed.toLowerCase().includes(word.toLowerCase())
        );

        if (containsForbiddenWord) {
            return {
                isValid: false,
                message: '부적절한 내용이 포함되어 있습니다.'
            };
        }

        return { isValid: true };
    }

    // 피드백 데이터 포맷팅
    formatFeedbackForSubmission(
        questList: string[],
        feedbackText: string,
        metadata?: any
    ): any {
        return {
            quests: questList,
            feedback: feedbackText.trim(),
            submittedAt: new Date().toISOString(),
            questCount: questList.length,
            feedbackLength: feedbackText.trim().length,
            metadata: {
                source: 'group_dashboard',
                version: '1.0',
                ...metadata
            }
        };
    }

    // 유틸리티: 퀘스트 완료율 계산
    calculateCompletionRate(group: Group): number {
        if (!group || !group.questList || !group.questSuccessNum || group.memberNum === 0) {
            return 0;
        }

        const totalPossibleCompletions = group.questList.length * group.memberNum;
        const totalCompletions = group.questSuccessNum.reduce((sum, count) => sum + count, 0);
        
        return Math.round((totalCompletions / totalPossibleCompletions) * 100);
    }

    // 유틸리티: 가장 인기 있는 퀘스트 찾기
    getMostPopularQuest(group: Group): { title: string; completions: number } | null {
        if (!group || !group.questList || !group.questSuccessNum) {
            return null;
        }

        let maxCompletions = 0;
        let mostPopularIndex = 0;

        group.questSuccessNum.forEach((completions, index) => {
            if (completions > maxCompletions) {
                maxCompletions = completions;
                mostPopularIndex = index;
            }
        });

        return {
            title: group.questList[mostPopularIndex],
            completions: maxCompletions
        };
    }

    // 유틸리티: 완료가 필요한 퀘스트 찾기
    getQuestsNeedingCompletion(group: Group, threshold: number = 50): Quest[] {
        if (!group) return [];

        const allQuests = this.processingQuest(group);
        return allQuests.filter(quest => quest.progress < threshold);
    }

    // 디버깅용 메서드
    logGroupStats(group: Group): void {
        if (!group) {
            console.log('No group data available');
            return;
        }

        console.group('=== Group Statistics ===');
        console.log('Group Name:', group.name);
        console.log('Members:', group.memberNum);
        console.log('Total Quests:', group.questList?.length || 0);
        console.log('Quest Success Numbers:', group.questSuccessNum);
        console.log('Completion Rate:', this.calculateCompletionRate(group) + '%');
        
        const popularQuest = this.getMostPopularQuest(group);
        if (popularQuest) {
            console.log('Most Popular Quest:', popularQuest.title, `(${popularQuest.completions} completions)`);
        }
        
        const needingCompletion = this.getQuestsNeedingCompletion(group);
        console.log('Quests Needing Attention:', needingCompletion.map(q => `${q.title} (${q.progress}%)`));
        
        console.groupEnd();
    }
}