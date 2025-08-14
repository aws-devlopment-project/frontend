import { Injectable } from "@angular/core";
import { GroupService } from "../../Core/Service/GroupService";
import { Group } from "../../Core/Models/group";
import { Quest, Stat } from "../Models/GroupDashboardModels";
import { UserService } from "../../Core/Service/UserService";
import { UserQuestCur } from "../../Core/Models/user";

interface QuestProcessingOptions {
  includeProgress?: boolean;
  filterCompleted?: boolean;
  sortByProgress?: boolean;
  useUserQuestCur?: boolean; // UserQuestCur 기반 처리 여부
}

interface FeedbackValidationResult {
  isValid: boolean;
  message?: string;
}

@Injectable({
  providedIn: 'root'  // 'platform'에서 'root'로 변경
})
export class GroupDashboardService {
  
  constructor(
    private groupService: GroupService, 
    private userService: UserService
  ) {}

  // === 기본 데이터 로딩 메서드들 ===
  
  /**
   * UserQuestCur의 questId와 Group의 questList를 매핑합니다
   */
  mapUserQuestToGroupQuest(
    userQuestCur: UserQuestCur, 
    group: Group, 
    groupName: string
  ): { [questId: string]: string } {
    const mapping: { [questId: string]: string } = {};
    
    if (!this.isValidUserQuestCur(userQuestCur) || !this.isValidGroup(group)) {
      return mapping;
    }

    const groupQuests = userQuestCur.curQuestTotalList.filter(
      quest => quest.group === groupName
    );

    groupQuests.forEach(quest => {
      mapping[quest.questId.toString()] = quest.quest;
    });

    return mapping;
  }

  /**
   * questId로 UserQuestCur에서 퀘스트 정보 찾기
   */
  findUserQuestByQuestId(
    userQuestCur: UserQuestCur, 
    questId: string, 
    groupName: string
  ): any | null {
    if (!this.isValidUserQuestCur(userQuestCur)) {
      return null;
    }

    return userQuestCur.curQuestTotalList.find(
      quest => quest.questId.toString() === questId && quest.group === groupName
    ) || null;
  }

  /**
   * 퀘스트 제목으로 UserQuestCur에서 퀘스트 정보 찾기
   */
  findUserQuestByTitle(
    userQuestCur: UserQuestCur, 
    questTitle: string, 
    groupName: string
  ): any | null {
    if (!this.isValidUserQuestCur(userQuestCur)) {
      return null;
    }

    return userQuestCur.curQuestTotalList.find(
      quest => quest.quest === questTitle && quest.group === groupName
    ) || null;
  }

  // === 퀘스트 상태 및 진행률 계산 ===

  /**
   * 성공 횟수와 멤버 수를 기반으로 진행률을 계산합니다
   */
  private calculateProgress(successCount: number, memberCount: number): number {
    if (memberCount === 0) return 0;
    return Math.min(Math.floor((successCount / memberCount) * 100), 100);
  }

  /**
   * 진행률을 기반으로 퀘스트 상태를 결정합니다 (기존 방식)
   */
  private determineQuestStatus(progress: number): Quest['status'] {
    if (progress >= 100) return 'completed';
    if (progress > 0) return 'in-progress';
    return 'not-started';
  }

  /**
   * 퀘스트 제목에 맞는 아이콘을 반환합니다
   */
  private getQuestIcon(questTitle: string): string {
    const iconMap: Record<string, string> = {
      'quest1': '💪',
      'quest2': '📚', 
      'quest3': '💧',
      'a': '💪',
      'b': '📚', 
      'c': '💧',
      'exercise': '🏃‍♂️',
      'reading': '📖',
      'water': '💧',
      'meditation': '🧘‍♀️',
      'coding': '💻',
      'study': '📖',
      'workout': '🏋️‍♀️',
      'walk': '🚶‍♀️'
    };

    // 정확한 매칭 시도
    const lowerTitle = questTitle.toLowerCase();
    if (iconMap[lowerTitle]) {
      return iconMap[lowerTitle];
    }

    // 부분 매칭 시도
    for (const [key, icon] of Object.entries(iconMap)) {
      if (lowerTitle.includes(key)) {
        return icon;
      }
    }

    return '⭐'; // 기본 아이콘
  }

  // === 통계 처리 (UserQuestCur 정보 활용) ===

  /**
   * 그룹 데이터와 UserQuestCur을 기반으로 향상된 통계를 처리합니다
   */
  processingStat(group: Group | undefined, userQuestCur?: UserQuestCur, groupName?: string): Stat[] {
    if (!this.isValidGroup(group)) {
      return this.getDefaultStats();
    }

    let achievementRate = this.calculateBasicAchievementRate(group!);

    // UserQuestCur이 있으면 개인 달성률 계산
    if (userQuestCur && groupName) {
      const personalRate = this.calculatePersonalAchievementRate(userQuestCur, groupName);
      if (personalRate >= 0) {
        achievementRate = personalRate;
      }
    }

    return [
      this.createStat('1', '전체 멤버', group!.memberNum, 'group', '명'),
      this.createStat('2', '퀘스트 달성률', achievementRate, 'thumb_up', '%'),
      this.createStat('3', '소모임 수', group!.clubList?.length || 0, 'star', '개')
    ];
  }

  /**
   * UserQuestCur 기반 개인 달성률 계산
   */
  private calculatePersonalAchievementRate(userQuestCur: UserQuestCur, groupName: string): number {
    if (!this.isValidUserQuestCur(userQuestCur)) {
      return -1;
    }

    const groupQuests = userQuestCur.curQuestTotalList.filter(
      quest => quest.group === groupName
    );

    if (groupQuests.length === 0) {
      return -1;
    }

    const completedQuests = groupQuests.filter(quest => quest.success).length;
    return Math.floor((completedQuests / groupQuests.length) * 100);
  }

  /**
   * 기본 그룹 달성률 계산
   */
  private calculateBasicAchievementRate(group: Group): number {
    const totalSuccessCount = this.calculateTotalSuccessCount(group);
    const totalPossibleCompletions = group.memberNum * group.questList.length;
    
    if (totalPossibleCompletions === 0) return 0;
    return Math.floor((totalSuccessCount / totalPossibleCompletions) * 100);
  }

  /**
   * 기본 통계 데이터를 반환합니다
   */
  private getDefaultStats(): Stat[] {
    return [
      this.createStat('1', '전체 멤버', 0, 'group', '명'),
      this.createStat('2', '퀘스트 달성률', 0, 'thumb_up', '%'),
      this.createStat('3', '소모임 수', 0, 'star', '개')
    ];
  }

  /**
   * 개별 통계 항목을 생성합니다
   */
  private createStat(id: string, label: string, value: number, icon: string, unit: string): Stat {
    return { id, label, value, icon, unit };
  }

  /**
   * 전체 성공 횟수를 계산합니다
   */
  private calculateTotalSuccessCount(group: Group): number {
    return group.questSuccessNum.reduce((total, count) => total + count, 0);
  }

  // === 피드백 시스템 (UserQuestCur 호환) ===

  /**
   * 피드백과 함께 퀘스트 완료를 처리합니다 (GroupService 사용)
   */
  async questSuccessWithFeedback(
    groupName: string, 
    username: string, 
    questList: string[], 
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
        questFeedbackData
      );

      return success;

    } catch (error) {
      console.error('Error in questSuccessWithFeedback:', error);
      return false;
    }
  }

  /**
   * 오프라인 퀘스트 동기화를 위한 래퍼 메서드
   */
  async syncOfflineQuestCompletion(
    userId: string, 
    groupName: string, 
    questTitles: string[]
  ): Promise<boolean> {
    try {
      // 오프라인 동기화 시에는 피드백 없이 퀘스트만 완료 처리
      return await this.questSuccessWithFeedback(
        groupName,
        userId,
        questTitles,
        '', // 빈 피드백
        undefined
      );
    } catch (error) {
      console.error('Error in offline quest sync:', error);
      return false;
    }
  }

  /**
   * UserQuestCur 기반으로 피드백 데이터를 준비합니다
   */
  private prepareFeedbackDataFromUserQuest(
    userQuestCur: UserQuestCur,
    groupName: string,
    questList: string[],
    feedbackText: string,
    isLike?: boolean
  ): Array<{club: string, quest: string, feedback: string}> {
    const feedbackSuffix = this.generateFeedbackSuffix(isLike);
    
    // UserQuestCur에서 해당 퀘스트들 찾기
    const relevantQuests = userQuestCur.curQuestTotalList.filter(
      quest => quest.group === groupName && questList.includes(quest.quest)
    );

    return relevantQuests.map(quest => ({
      club: quest.club,
      quest: quest.quest,
      feedback: `${feedbackText.trim()}\n${feedbackSuffix}`
    }));
  }

  /**
   * 피드백 접미사를 생성합니다
   */
  private generateFeedbackSuffix(isLike?: boolean): string {
    const baseMessage = "해당 주제에 관한 피드백을 주시면 감사하겠습니다";
    
    if (isLike === true) {
      return `👍 긍정적인 경험이었습니다. ${baseMessage}`;
    } else if (isLike === false) {
      return `👎 개선이 필요한 부분이 있습니다. ${baseMessage}`;
    }
    
    return baseMessage;
  }

  // === 데이터 검증 및 유틸리티 ===

  /**
   * UserQuestCur 데이터의 유효성을 검사합니다
   */
  private isValidUserQuestCur(userQuestCur: UserQuestCur | null | undefined): boolean {
    return !!(
      userQuestCur && 
      userQuestCur.curQuestTotalList && 
      Array.isArray(userQuestCur.curQuestTotalList) &&
      userQuestCur.curQuestTotalList.length > 0
    );
  }

  /**
   * 그룹 데이터의 유효성을 검사합니다
   */
  private isValidGroup(group: Group | undefined): boolean {
    return !!(
      group && 
      group.questList && 
      group.questSuccessNum && 
      group.memberNum > 0 &&
      group.questList.length === group.questSuccessNum.length
    );
  }

  /**
   * UserQuestCur와 Group 데이터의 일관성을 검사합니다
   */
  validateDataConsistency(
    userQuestCur: UserQuestCur, 
    group: Group, 
    groupName: string
  ): {
    isConsistent: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      if (!this.isValidUserQuestCur(userQuestCur)) {
        issues.push('UserQuestCur 데이터가 유효하지 않습니다.');
        recommendations.push('사용자 퀘스트 데이터를 다시 로드하세요.');
      }

      if (!this.isValidGroup(group)) {
        issues.push('Group 데이터가 유효하지 않습니다.');
        recommendations.push('그룹 데이터를 다시 로드하세요.');
      }

      if (this.isValidUserQuestCur(userQuestCur) && this.isValidGroup(group)) {
        const userGroupQuests = userQuestCur.curQuestTotalList.filter(
          quest => quest.group === groupName
        );

        const groupQuestTitles = new Set(group.questList);
        const userQuestTitles = new Set(userGroupQuests.map(q => q.quest));

        // Group에 있지만 UserQuestCur에 없는 퀘스트
        const missingInUser = group.questList.filter(
          title => !userQuestTitles.has(title)
        );

        // UserQuestCur에 있지만 Group에 없는 퀘스트
        const extraInUser = userGroupQuests.filter(
          quest => !groupQuestTitles.has(quest.quest)
        );

        if (missingInUser.length > 0) {
          issues.push(`UserQuestCur에 누락된 퀘스트: ${missingInUser.join(', ')}`);
          recommendations.push('사용자 퀘스트 데이터를 서버에서 다시 동기화하세요.');
        }

        if (extraInUser.length > 0) {
          issues.push(`Group에 없는 사용자 퀘스트: ${extraInUser.map(q => q.quest).join(', ')}`);
          recommendations.push('그룹 데이터를 새로고침하거나 오래된 사용자 퀘스트를 정리하세요.');
        }

        // questId 중복 검사
        const questIds = userGroupQuests.map(q => q.questId);
        const uniqueQuestIds = new Set(questIds);
        if (questIds.length !== uniqueQuestIds.size) {
          issues.push('중복된 questId가 발견되었습니다.');
          recommendations.push('사용자 퀘스트 데이터를 완전히 새로고침하세요.');
        }
      }

      return {
        isConsistent: issues.length === 0,
        issues,
        recommendations
      };

    } catch (error) {
      console.error('데이터 일관성 검사 중 오류:', error);
      return {
        isConsistent: false,
        issues: ['데이터 일관성 검사 중 오류가 발생했습니다.'],
        recommendations: ['전체 데이터를 다시 로드하세요.']
      };
    }
  }

  // === 기존 호환성 메서드들 ===

  /**
   * 피드백 검증 (기존 호환성)
   */
  validateFeedback(feedbackText: string): FeedbackValidationResult {
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

  /**
   * 제출용 피드백 데이터를 포맷팅합니다
   */
  formatFeedbackForSubmission(
    questList: string[],
    feedbackText: string,
    isLike?: boolean,
    metadata?: any
  ): any {
    return {
      quests: questList,
      feedback: feedbackText.trim(),
      isLike: isLike,
      submittedAt: new Date().toISOString(),
      questCount: questList.length,
      feedbackLength: feedbackText.trim().length,
      metadata: {
        source: 'group_dashboard',
        version: '2.0',
        sentiment: isLike !== undefined ? (isLike ? 'positive' : 'negative') : 'neutral',
        ...metadata
      }
    };
  }

  /**
   * 퀘스트 완료율을 계산합니다
   */
  calculateCompletionRate(group: Group): number {
    if (!this.isValidGroup(group)) return 0;

    const totalPossibleCompletions = group!.questList.length * group!.memberNum;
    const totalCompletions = this.calculateTotalSuccessCount(group!);
    
    return Math.round((totalCompletions / totalPossibleCompletions) * 100);
  }

  /**
   * UserQuestCur 기반 개인 완료율 계산
   */
  calculatePersonalCompletionRate(userQuestCur: UserQuestCur, groupName: string): number {
    if (!this.isValidUserQuestCur(userQuestCur)) return 0;

    const groupQuests = userQuestCur.curQuestTotalList.filter(
      quest => quest.group === groupName
    );

    if (groupQuests.length === 0) return 0;

    const completedQuests = groupQuests.filter(quest => quest.success).length;
    return Math.round((completedQuests / groupQuests.length) * 100);
  }

  /**
   * 가장 인기 있는 퀘스트를 찾습니다
   */
  getMostPopularQuest(group: Group): { title: string; completions: number } | null {
    if (!this.isValidGroup(group)) return null;

    let maxCompletions = 0;
    let mostPopularIndex = 0;

    group!.questSuccessNum.forEach((completions, index) => {
      if (completions > maxCompletions) {
        maxCompletions = completions;
        mostPopularIndex = index;
      }
    });

    return {
      title: group!.questList[mostPopularIndex],
      completions: maxCompletions
    };
  }

  /**
   * UserQuestCur 기반으로 사용자가 가장 많이 완료한 퀘스트 찾기
   */
  getUserMostCompletedQuestType(userQuestCur: UserQuestCur): { title: string; count: number } | null {
    if (!this.isValidUserQuestCur(userQuestCur)) return null;

    const questCounts: { [title: string]: number } = {};
    
    userQuestCur.curQuestTotalList.forEach(quest => {
      if (quest.success) {
        questCounts[quest.quest] = (questCounts[quest.quest] || 0) + 1;
      }
    });

    const entries = Object.entries(questCounts);
    if (entries.length === 0) return null;

    const [title, count] = entries.reduce((max, current) => 
      current[1] > max[1] ? current : max
    );

    return { title, count };
  }

  /**
   * 완료가 필요한 퀘스트를 찾습니다
   */
  getQuestsNeedingCompletion(group: Group, threshold: number = 50): Quest[] {
    if (!this.isValidGroup(group)) return [];

    const allQuests = this.processingQuest(group, { includeProgress: true });
    return allQuests.filter(quest => quest.progress < threshold);
  }

  /**
   * UserQuestCur 기반으로 미완료 퀘스트 찾기
   */
  getUserIncompleteQuests(userQuestCur: UserQuestCur, groupName: string): any[] {
    if (!this.isValidUserQuestCur(userQuestCur)) return [];

    return userQuestCur.curQuestTotalList.filter(
      quest => quest.group === groupName && !quest.success
    );
  }

  // === 디버깅 및 로깅 ===

  /**
   * UserQuestCur 기반 통계를 콘솔에 로깅합니다
   */
  logUserQuestStats(userQuestCur: UserQuestCur, groupName: string): void {
    if (!this.isValidUserQuestCur(userQuestCur)) {
      console.log('❌ 유효하지 않은 UserQuestCur 데이터');
      return;
    }

    const groupQuests = userQuestCur.curQuestTotalList.filter(
      quest => quest.group === groupName
    );

    const completedQuests = groupQuests.filter(quest => quest.success);
    const completionRate = groupQuests.length > 0 ? 
      Math.round((completedQuests.length / groupQuests.length) * 100) : 0;

    console.group('=== 📊 UserQuestCur 기반 통계 ===');
    console.log('🏢 그룹명:', groupName);
    console.log('📋 총 퀘스트:', groupQuests.length);
    console.log('✅ 완료된 퀘스트:', completedQuests.length);
    console.log('📈 개인 완료율:', completionRate + '%');
    
    console.group('📝 퀘스트 상세');
    groupQuests.forEach(quest => {
      console.log(`${quest.success ? '✅' : '⏳'} ${quest.quest}`, {
        questId: quest.questId,
        club: quest.club,
        success: quest.success,
        descriptions: quest.descriptions
      });
    });
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * 그룹 통계를 콘솔에 로깅합니다 (기존 호환성)
   */
  logGroupStats(group: Group): void {
    if (!this.isValidGroup(group)) {
      console.log('❌ 유효하지 않은 그룹 데이터');
      return;
    }

    const completionRate = this.calculateCompletionRate(group);
    const popularQuest = this.getMostPopularQuest(group);

    console.group('=== 📊 그룹 통계 분석 ===');
    console.log('🏢 그룹명:', group.name);
    console.log('👥 멤버 수:', group.memberNum);
    console.log('📋 전체 퀘스트:', group.questList?.length || 0);
    console.log('✅ 퀘스트 성공 현황:', group.questSuccessNum);
    console.log('📈 완료율:', completionRate + '%');
    
    if (popularQuest) {
      console.log('🌟 가장 인기 퀘스트:', popularQuest.title, `(${popularQuest.completions}회 완료)`);
    }

    console.group('📋 퀘스트 목록');
    group.questList.forEach((quest, index) => {
      const successCount = group.questSuccessNum[index] || 0;
      const progress = this.calculateProgress(successCount, group.memberNum);
      console.log(`${progress >= 100 ? '✅' : '⏳'} ${quest}:`, {
        성공횟수: successCount,
        진행률: progress + '%'
      });
    });
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * 데이터 일관성 검사 결과를 로깅합니다
   */
  logDataConsistency(userQuestCur: UserQuestCur, group: Group, groupName: string): void {
    const validation = this.validateDataConsistency(userQuestCur, group, groupName);
    
    console.group('=== 🔧 데이터 일관성 검사 ===');
    console.log('상태:', validation.isConsistent ? '✅ 일관성 있음' : '❌ 문제 발견');
    
    if (validation.issues.length > 0) {
      console.group('⚠️ 발견된 문제');
      validation.issues.forEach(issue => console.log('📝', issue));
      console.groupEnd();
    }
    
    if (validation.recommendations.length > 0) {
      console.group('💡 권장 사항');
      validation.recommendations.forEach(rec => console.log('🔧', rec));
      console.groupEnd();
    }
    
    console.groupEnd();
  }

  /**
   * 서비스 설정을 반환합니다
   */
  getServiceConfig(): {
    version: string;
    features: string[];
    dataSource: string;
    limits: Record<string, number>;
  } {
    return {
      version: '2.1.0',
      features: [
        'userquestcur_integration',
        'quest_processing',
        'statistics',
        'feedback_system',
        'data_validation',
        'consistency_check'
      ],
      dataSource: 'UserQuestCur + Group',
      limits: {
        maxQuestsPerBatch: 10,
        maxFeedbackLength: 200,
        minFeedbackLength: 5,
        cacheTimeout: 300000, // 5분
        maxRetries: 3
      }
    };
  }
  async getGroupData(groupname: string): Promise<Group | undefined> {
    try {
      return await this.groupService.getGroupInfo(groupname);
    } catch (error) {
      console.error('Error fetching group data:', error);
      return undefined;
    }
  }

  /**
   * 사용자 퀘스트 데이터를 가져옵니다
   */
  async getUserQuestData(username: string): Promise<UserQuestCur | null> {
    try {
      return await this.userService.getUserQuestCur(username);
    } catch (error) {
      console.error('Error fetching user quest data:', error);
      return null;
    }
  }

  // === UserQuestCur 중심 퀘스트 처리 (핵심) ===

  /**
   * UserQuestCur를 기반으로 퀘스트 목록을 생성합니다 (메인 메서드)
   */
  createQuestsFromUserQuestCur(
    userQuestCur: UserQuestCur, 
    group: Group, 
    groupName: string,
    options: QuestProcessingOptions = {}
  ): Quest[] {
    if (!this.isValidUserQuestCur(userQuestCur) || !this.isValidGroup(group)) {
      return [];
    }

    // 현재 그룹의 퀘스트만 필터링
    const currentGroupQuests = userQuestCur.curQuestTotalList.filter(
      quest => quest.group === groupName
    );

    // UserQuestCur 데이터를 기반으로 Quest 객체 생성
    const quests = currentGroupQuests.map(questRecord => 
      this.createQuestFromUserQuestRecord(questRecord, group, options)
    );

    return this.applyQuestFiltering(quests, options);
  }

  /**
   * UserQuestCur의 개별 퀘스트 레코드에서 Quest 객체 생성
   */
  private createQuestFromUserQuestRecord(
    questRecord: any, // UserQuestCur의 curQuestTotalList 항목
    group: Group,
    options: QuestProcessingOptions
  ): Quest {
    // 그룹 데이터에서 진행률 계산
    const questIndex = group.questList.indexOf(questRecord.quest);
    const successCount = questIndex !== -1 ? (group.questSuccessNum[questIndex] || 0) : 0;
    const progress = options.includeProgress !== false ? 
      this.calculateProgress(successCount, group.memberNum) : 0;

    return {
      id: questRecord.questId.toString(), // ✅ UserQuestCur의 실제 questId 사용
      title: questRecord.quest,
      description: questRecord.descriptions || `${questRecord.quest} 퀘스트를 완료하세요`,
      icon: this.getQuestIcon(questRecord.quest),
      progress: progress,
      status: this.determineQuestStatusFromUserQuest(questRecord.success, progress)
    };
  }

  /**
   * UserQuestCur 기반 퀘스트 상태 결정
   */
  private determineQuestStatusFromUserQuest(isUserCompleted: boolean, progress: number): Quest['status'] {
    // UserQuestCur의 success 필드가 우선
    if (isUserCompleted) return 'completed';
    
    // 그룹 진행률 기반 보조 판단
    if (progress >= 100) return 'completed';
    if (progress > 0) return 'in-progress';
    return 'not-started';
  }

  // === 기존 Group 기반 퀘스트 처리 (호환성 유지) ===

  /**
   * 그룹 데이터를 기반으로 퀘스트 목록을 처리합니다 (기존 호환성)
   */
  processingQuest(group: Group | undefined, options: QuestProcessingOptions = {}): Quest[] {
    if (!this.isValidGroup(group)) {
      return [];
    }

    const quests = group!.questList.map((questTitle, index) => 
      this.createQuestFromGroupData(group!, questTitle, index, options)
    );

    return this.applyQuestFiltering(quests, options);
  }

  /**
   * 그룹 데이터에서 개별 퀘스트를 생성합니다 (기존 방식)
   */
  private createQuestFromGroupData(
    group: Group, 
    questTitle: string, 
    index: number, 
    options: QuestProcessingOptions
  ): Quest {
    const successCount = group.questSuccessNum[index] || 0;
    const progress = options.includeProgress !== false ? 
      this.calculateProgress(successCount, group.memberNum) : 0;
    
    // questId를 questTitle에서 추출하거나 인덱스 기반 생성
    const questId = this.extractQuestIdFromTitle(questTitle) || this.generateQuestIdFromIndex(index);
    
    return {
      id: questId.toString(),
      title: questTitle,
      description: `${questTitle} 퀘스트를 완료하세요`,
      icon: this.getQuestIcon(questTitle),
      progress: progress,
      status: this.determineQuestStatus(progress)
    };
  }

  /**
   * 퀘스트 목록에 필터링을 적용합니다
   */
  private applyQuestFiltering(quests: Quest[], options: QuestProcessingOptions): Quest[] {
    let filtered = [...quests];

    if (options.filterCompleted) {
      filtered = filtered.filter(quest => quest.status !== 'completed');
    }

    if (options.sortByProgress) {
      filtered.sort((a, b) => b.progress - a.progress);
    }

    return filtered;
  }

  // === questId 관리 (UserQuestCur 호환) ===

  /**
   * 퀘스트 제목에서 questId를 추출합니다
   */
  private extractQuestIdFromTitle(questTitle: string): number | null {
    // "quest1", "quest2" 형태에서 숫자 추출
    const questMatch = questTitle.match(/quest(\d+)/i);
    if (questMatch && questMatch[1]) {
      return parseInt(questMatch[1], 10);
    }
    
    // 다른 숫자 패턴 확인
    const numberMatch = questTitle.match(/(\d+)/);
    if (numberMatch && numberMatch[1]) {
      return parseInt(numberMatch[1], 10);
    }
    
    return null;
  }

  private generateQuestIdFromIndex(index: number): number {
    // 인덱스 기반으로 간단한 ID 생성 (1부터 시작)
    return index + 1;
  }
}