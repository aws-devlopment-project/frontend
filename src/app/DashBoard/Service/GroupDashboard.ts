import { Injectable } from "@angular/core";
import { GroupService } from "../../Core/Service/GroupService";
import { Group } from "../../Core/Models/group";
import { UserService } from "../../Core/Service/UserService";
import { UserQuestCur } from "../../Core/Models/user";

@Injectable({
  providedIn: 'root'  // 'platform'에서 'root'로 변경
})
export class GroupDashboardService {
  
  constructor(
    private groupService: GroupService, 
    private userService: UserService
  ) {}


  async getGroupData(groupname: string): Promise<Group | undefined> {
    try {
      return await this.groupService.getGroupInfo(groupname);
    } catch (error) {
      console.error('Error fetching group data:', error);
      return undefined;
    }
  }

  async questSuccessWithFeedback(
    groupName: string, 
    username: string, 
    questList: string, 
    feedbackText?: string,
    isLike?: boolean
  ): Promise<boolean> {
    try {
      // UserQuestCur에서 최신 데이터 가져오기 (club 정보 필요)
      const userQuestCur = await this.userService.getUserQuestCur(username);
      if (!userQuestCur) {
        throw new Error('사용자 퀘스트 데이터를 찾을 수 없습니다.');
      }

      // 피드백 데이터 준비
      const questFeedbackData = this.prepareFeedbackDataFromUserQuest(
        userQuestCur,
        groupName,
        questList,
        feedbackText || '',
        isLike
      );

      // ✅ GroupService의 questSuccessWithFeedback 사용 (UserQuestCur도 함께 업데이트됨)
      const success = await this.groupService.questSuccessWithFeedback(
        groupName, 
        username,
        questFeedbackData.quest,
        questFeedbackData.club,
        questFeedbackData.feedback,
        isLike
      );

      return success;

    } catch (error) {
      console.error('Error in questSuccessWithFeedback:', error);
      return false;
    }
  }

  private prepareFeedbackDataFromUserQuest(
    userQuestCur: UserQuestCur,
    groupName: string,
    questName: string,
    feedbackText: string,
    isLike?: boolean
  ): {club: string, quest: string, feedback: string} {
    const feedbackSuffix = this.generateFeedbackSuffix(isLike);
    
    // UserQuestCur에서 해당 퀘스트들 찾기
    const relevantQuests = userQuestCur.curQuestTotalList.filter(
      quest => quest.group === groupName && questName === quest.quest
    );

    return relevantQuests.map(quest => ({
      club: quest.club,
      quest: quest.quest,
      feedback: `${feedbackText.trim()}\n${feedbackSuffix}`
    }))[0];
  }

  private generateFeedbackSuffix(isLike?: boolean): string {
    const baseMessage = "해당 주제에 관한 피드백을 주시면 감사하겠습니다";
    
    if (isLike === true) {
      return `👍 긍정적인 경험이었습니다. ${baseMessage}`;
    } else if (isLike === false) {
      return `👎 개선이 필요한 부분이 있습니다. ${baseMessage}`;
    }
    
    return baseMessage;
  }
}