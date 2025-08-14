import { Injectable } from '@angular/core';
import { SharedStateService } from '../../Core/Service/SharedService';
import { LocalActivityService } from '../../DashBoard/Service/LocalActivityService';
import { UserService } from '../../Core/Service/UserService';
import { QAKnowledgeService, QASearchResult } from './QAKnowledgeService';

export interface DynamicQuery {
  type: 'quest_today' | 'quest_progress' | 'stats' | 'streak' | 'group_info' | 'recent_activity' | 'help';
  parameters?: { [key: string]: any };
  userContext?: any;
}

export interface DynamicResponse {
  content: string;
  isSuccess: boolean;
  dataSource: 'realtime' | 'cached' | 'static';
  timestamp: Date;
  confidence: number;
}

@Injectable({
  providedIn: 'root'
})
export class DynamicResponseService {
  private readonly queryPatterns = new Map<RegExp, DynamicQuery['type']>([
    // 퀘스트 관련
    [/오늘.*퀘스트|퀘스트.*오늘|today.*quest/i, 'quest_today'],
    [/퀘스트.*진행|진행.*퀘스트|quest.*progress/i, 'quest_progress'],
    
    // 통계 관련
    [/통계|stats|성과|진행률|달성률/i, 'stats'],
    [/연속.*기록|기록.*연속|streak/i, 'streak'],
    
    // 그룹 관련
    [/그룹.*정보|참여.*그룹|group.*info/i, 'group_info'],
    
    // 최근 활동
    [/최근.*활동|활동.*내역|recent.*activity/i, 'recent_activity'],
    
    // 도움말
    [/도움|help|가이드|사용법|방법/i, 'help']
  ]);

  constructor(
    private sharedState: SharedStateService,
    private activityService: LocalActivityService,
    private userService: UserService,
    private qaService: QAKnowledgeService
  ) {}

  async generateDynamicResponse(query: string, userContext?: any): Promise<DynamicResponse> {
    try {
      // 1. 쿼리 타입 분석
      const dynamicQuery = this.analyzeQuery(query, userContext);
      
      // 2. 정적 Q&A 먼저 확인
      const staticResults = this.qaService.searchQA(query, 3);
      
      // 3. 동적 데이터가 필요한 경우 처리
      if (dynamicQuery.type !== 'help' && this.needsDynamicData(dynamicQuery.type)) {
        const dynamicContent = await this.fetchDynamicContent(dynamicQuery);
        
        // 4. 정적 Q&A와 동적 데이터 결합
        return this.combineStaticAndDynamic(staticResults, dynamicContent, dynamicQuery);
      }
      
      // 5. 정적 응답만 반환
      return this.createStaticResponse(staticResults, query);
      
    } catch (error) {
      console.error('Dynamic response generation failed:', error);
      return this.createErrorResponse(query);
    }
  }

  private analyzeQuery(query: string, userContext?: any): DynamicQuery {
    // 패턴 매칭으로 쿼리 타입 결정
    for (const [pattern, type] of this.queryPatterns) {
      if (pattern.test(query)) {
        return {
          type,
          parameters: this.extractParameters(query, type),
          userContext
        };
      }
    }
    
    return { type: 'help', userContext };
  }

  private extractParameters(query: string, type: DynamicQuery['type']): { [key: string]: any } {
    const params: { [key: string]: any } = {};
    
    switch (type) {
      case 'quest_today':
        // 특정 그룹명이 언급되었는지 확인
        const groupMatch = query.match(/(\w+)\s*그룹/);
        if (groupMatch) {
          params['groupName'] = groupMatch[1];
        }
        break;
        
      case 'stats':
        // 기간 정보 추출
        if (query.includes('주간') || query.includes('week')) {
          params['period'] = 'week';
        } else if (query.includes('월간') || query.includes('month')) {
          params['period'] = 'month';
        } else {
          params['period'] = 'total';
        }
        break;
        
      case 'streak':
        // 특정 활동 타입 추출
        if (query.includes('퀘스트')) {
          params['ctivityType'] = 'quest';
        }
        break;
    }
    
    return params;
  }

  private needsDynamicData(type: DynamicQuery['type']): boolean {
    return ['quest_today', 'quest_progress', 'stats', 'streak', 'group_info', 'recent_activity'].includes(type);
  }

  private async fetchDynamicContent(query: DynamicQuery): Promise<any> {
    switch (query.type) {
      case 'quest_today':
        return await this.getTodayQuests(query.parameters?.['groupName']);
        
      case 'quest_progress':
        return await this.getQuestProgress();
        
      case 'stats':
        return await this.getUserStats(query.parameters?.['period']);
        
      case 'streak':
        return await this.getStreakInfo(query.parameters?.['activityType']);
        
      case 'group_info':
        return await this.getGroupInfo();
        
      case 'recent_activity':
        return await this.getRecentActivity();
        
      default:
        return null;
    }
  }

  // === 동적 데이터 조회 메서드들 ===

  private async getTodayQuests(specificGroup?: string): Promise<any> {
    try {
      const userCreds = await this.userService.getUserCredentials();
      if (!userCreds) {
        return { error: '사용자 정보를 찾을 수 없습니다.' };
      }

      const questCur = await this.userService.getUserQuestCur(userCreds.id);
      if (!questCur) {
        return { error: '퀘스트 정보를 불러올 수 없습니다.' };
      }
      const todayQuests = questCur.curQuestTotalList.filter(quest => {
        const groupMatches = !specificGroup || quest.group.includes(specificGroup);
        return groupMatches;
      });

      const completedCount = todayQuests.filter(q => q.success).length;
      const totalCount = todayQuests.length;
      const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      return {
        todayQuests,
        completedCount,
        totalCount,
        completionRate,
        specificGroup,
        hasQuests: totalCount > 0
      };
    } catch (error) {
      console.error('Error fetching today quests:', error);
      return { error: '퀘스트 정보 조회 중 오류가 발생했습니다.' };
    }
  }

  private async getQuestProgress(): Promise<any> {
    try {
      const questStats = await this.activityService.getQuestBasedStats();
      return {
        ...questStats,
        hasData: questStats.currentQuests > 0
      };
    } catch (error) {
      console.error('Error fetching quest progress:', error);
      return { error: '퀘스트 진행 정보를 불러올 수 없습니다.' };
    }
  }

  private async getUserStats(period: string = 'total'): Promise<any> {
    try {
      const activityStats = this.activityService.getActivityStats();
      const questStats = await this.activityService.getQuestBasedStats();
      const groupStats = await this.activityService.getGroupParticipationStats();

      return {
        period,
        activity: activityStats,
        quest: questStats,
        group: groupStats,
        hasData: activityStats.totalActivities > 0
      };
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return { error: '통계 정보를 불러올 수 없습니다.' };
    }
  }

  private async getStreakInfo(activityType?: string): Promise<any> {
    try {
      const currentStreak = this.activityService.getCurrentStreak();
      const longestStreak = this.activityService.getLongestStreak();
      const streakData = this.activityService.streakData();
      
      // 최근 7일간의 스트릭 정보
      const recentDays = streakData.slice(-7);
      const activeDays = recentDays.filter(day => day.hasActivity).length;

      return {
        currentStreak,
        longestStreak,
        recentActiveDays: activeDays,
        totalDaysTracked: streakData.length,
        recentDays,
        activityType,
        hasStreak: currentStreak > 0
      };
    } catch (error) {
      console.error('Error fetching streak info:', error);
      return { error: '연속 기록 정보를 불러올 수 없습니다.' };
    }
  }

  private async getGroupInfo(): Promise<any> {
    try {
      const groupStats = await this.activityService.getGroupParticipationStats();
      const availableGroups = this.sharedState.availableGroups();
      const selectedGroup = this.sharedState.selectedGroup();

      return {
        ...groupStats,
        availableGroups,
        selectedGroup,
        hasGroups: groupStats.totalGroups > 0
      };
    } catch (error) {
      console.error('Error fetching group info:', error);
      return { error: '그룹 정보를 불러올 수 없습니다.' };
    }
  }

  private async getRecentActivity(): Promise<any> {
    try {
      const activities = this.activityService.activities();
      const recentActivities = activities.slice(0, 5); // 최근 5개
      
      const activitySummary = {
        questCompletions: activities.filter(a => a.type === 'quest_complete').length,
        groupJoins: activities.filter(a => a.type === 'group_join').length,
        clubJoins: activities.filter(a => a.type === 'club_join').length,
        totalActivities: activities.length
      };

      return {
        recentActivities,
        summary: activitySummary,
        hasActivity: activities.length > 0
      };
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      return { error: '최근 활동 정보를 불러올 수 없습니다.' };
    }
  }

  // === 응답 생성 메서드들 ===

  private async combineStaticAndDynamic(
    staticResults: QASearchResult[], 
    dynamicData: any, 
    query: DynamicQuery
  ): Promise<DynamicResponse> {
    let content = '';
    
    // 동적 데이터 기반 응답 생성
    const dynamicContent = this.formatDynamicContent(dynamicData, query.type);
    content += dynamicContent;
    
    // 관련된 정적 Q&A가 있으면 추가
    if (staticResults.length > 0 && staticResults[0].score > 0.5) {
      content += '\n\n📚 관련 도움말:\n';
      content += staticResults.slice(0, 2).map((result, index) => 
        `${index + 1}. ${result.item.question}\n   ${result.item.answer.substring(0, 100)}${result.item.answer.length > 100 ? '...' : ''}`
      ).join('\n\n');
    }

    return {
      content,
      isSuccess: !dynamicData?.error,
      dataSource: 'realtime',
      timestamp: new Date(),
      confidence: dynamicData?.error ? 0.3 : 0.9
    };
  }

  private formatDynamicContent(data: any, type: DynamicQuery['type']): string {
    if (data?.error) {
      return `❌ ${data.error}`;
    }

    switch (type) {
      case 'quest_today':
        return this.formatTodayQuests(data);
        
      case 'quest_progress':
        return this.formatQuestProgress(data);
        
      case 'stats':
        return this.formatUserStats(data);
        
      case 'streak':
        return this.formatStreakInfo(data);
        
      case 'group_info':
        return this.formatGroupInfo(data);
        
      case 'recent_activity':
        return this.formatRecentActivity(data);
        
      default:
        return '요청하신 정보를 처리할 수 없습니다.';
    }
  }

  private formatTodayQuests(data: any): string {
    if (!data.hasQuests) {
      return `📅 오늘은 ${data.specificGroup ? `${data.specificGroup} 그룹에` : ''} 진행할 퀘스트가 없습니다.\n\n새로운 퀘스트에 참여해보세요! 🎯`;
    }

    let response = `📅 오늘의 퀘스트 현황${data.specificGroup ? ` (${data.specificGroup} 그룹)` : ''}:\n\n`;
    response += `✅ 완료: ${data.completedCount}개\n`;
    response += `📝 전체: ${data.totalCount}개\n`;
    response += `📊 달성률: ${data.completionRate}%\n\n`;

    if (data.completionRate === 100) {
      response += `🎉 오늘 모든 퀘스트를 완료했습니다! 대단해요!`;
    } else if (data.completionRate >= 50) {
      response += `💪 절반 이상 진행했네요! 조금만 더 화이팅!`;
    } else {
      response += `🌱 아직 시작 단계입니다. 하나씩 차근차근 완료해보세요!`;
    }

    return response;
  }

  private formatQuestProgress(data: any): string {
    if (!data.hasData) {
      return `📈 아직 진행 중인 퀘스트가 없습니다.\n\n새로운 퀘스트에 참여해서 성장의 여정을 시작해보세요! 🚀`;
    }

    let response = `📈 퀘스트 진행 현황:\n\n`;
    response += `🎯 현재 퀘스트: ${data.currentQuests}개\n`;
    response += `✅ 완료된 퀘스트: ${data.completedQuests}개\n`;
    response += `📊 완료율: ${data.completionRate}%\n`;
    
    if (data.favoriteGroup && data.favoriteGroup !== '없음') {
      response += `⭐ 가장 활발한 그룹: ${data.favoriteGroup}\n`;
    }

    response += `\n`;
    
    if (data.completionRate >= 80) {
      response += `🏆 놀라운 성과입니다! 이런 꾸준함이 큰 변화를 만들어냅니다!`;
    } else if (data.completionRate >= 50) {
      response += `👍 좋은 진전이에요! 계속해서 멋진 성과를 이어가세요!`;
    } else {
      response += `🌱 좋은 시작입니다! 꾸준함이 가장 중요해요!`;
    }

    return response;
  }

  private formatUserStats(data: any): string {
    if (!data.hasData) {
      return `📊 아직 활동 데이터가 없습니다.\n\n활동을 시작하시면 여기서 상세한 통계를 확인할 수 있습니다! 📈`;
    }

    let response = `📊 ${data.period === 'week' ? '주간' : data.period === 'month' ? '월간' : '전체'} 활동 통계:\n\n`;
    
    // 기본 활동 통계
    response += `🎯 총 활동: ${data.activity.totalActivities}회\n`;
    response += `⭐ 획득 포인트: ${data.activity.totalPoints}점\n`;
    response += `🔥 연속 기록: ${data.activity.streakCount}일\n`;
    
    // 퀘스트 통계
    if (data.quest.currentQuests > 0) {
      response += `\n📈 퀘스트 성과:\n`;
      response += `• 진행 중: ${data.quest.currentQuests}개\n`;
      response += `• 완료율: ${data.quest.completionRate}%\n`;
    }
    
    // 그룹 통계
    if (data.group.totalGroups > 0) {
      response += `\n👥 참여 현황:\n`;
      response += `• 참여 그룹: ${data.group.totalGroups}개\n`;
      response += `• 참여 채널: ${data.group.totalClubs}개\n`;
    }

    return response;
  }

  private formatStreakInfo(data: any): string {
    if (!data.hasStreak) {
      return `🔥 아직 연속 기록이 없습니다.\n\n오늘부터 새로운 연속 기록을 시작해보세요! 매일 조금씩이라도 꾸준히 하는 것이 중요합니다. 💪`;
    }

    let response = `🔥 연속 활동 기록:\n\n`;
    response += `📅 현재 연속: ${data.currentStreak}일\n`;
    response += `🏆 최장 기록: ${data.longestStreak}일\n`;
    response += `📊 최근 7일 중 활동일: ${data.recentActiveDays}일\n\n`;

    if (data.currentStreak >= 30) {
      response += `🏅 한 달 연속! 정말 놀라운 성과입니다!`;
    } else if (data.currentStreak >= 7) {
      response += `⭐ 일주일 연속! 훌륭한 습관이 만들어지고 있어요!`;
    } else if (data.currentStreak >= 3) {
      response += `💪 3일 연속! 좋은 흐름이네요, 계속 이어가세요!`;
    } else {
      response += `🌱 좋은 시작입니다! 연속 기록을 늘려가보세요!`;
    }

    return response;
  }

  private formatGroupInfo(data: any): string {
    if (!data.hasGroups) {
      return `👥 아직 참여한 그룹이 없습니다.\n\n다양한 그룹에 참여해서 같은 목표를 가진 사람들과 함께 성장해보세요! 🌟`;
    }

    let response = `👥 그룹 참여 현황:\n\n`;
    response += `📊 참여 그룹: ${data.totalGroups}개\n`;
    response += `🏠 참여 채널: ${data.totalClubs}개\n`;
    
    if (data.mostActiveGroup && data.mostActiveGroup !== '없음') {
      response += `⭐ 가장 활발한 그룹: ${data.mostActiveGroup}\n`;
    }
    
    if (data.recentlyJoinedGroup && data.recentlyJoinedGroup !== '없음') {
      response += `🆕 최근 가입: ${data.recentlyJoinedGroup}\n`;
    }

    response += `\n🎯 멋진 커뮤니티 참여도네요! 함께하는 성장의 힘을 느껴보세요!`;

    return response;
  }

  private formatRecentActivity(data: any): string {
    if (!data.hasActivity) {
      return `📱 아직 활동 기록이 없습니다.\n\n첫 번째 활동을 시작해보세요! 작은 시작이 큰 변화의 첫걸음입니다. 🚀`;
    }

    let response = `📱 최근 활동 요약:\n\n`;
    response += `🎯 퀘스트 완료: ${data.summary.questCompletions}회\n`;
    response += `👥 그룹 가입: ${data.summary.groupJoins}회\n`;
    response += `🏠 채널 가입: ${data.summary.clubJoins}회\n`;
    response += `📊 총 활동: ${data.summary.totalActivities}회\n\n`;

    if (data.recentActivities.length > 0) {
      response += `🕐 최근 활동:\n`;
      data.recentActivities.slice(0, 3).forEach((activity: any, index: number) => {
        const timeAgo = this.getTimeAgo(new Date(activity.timestamp));
        response += `• ${activity.title} (${timeAgo})\n`;
      });
    }

    return response;
  }

  private createStaticResponse(staticResults: QASearchResult[], query: string): DynamicResponse {
    if (staticResults.length === 0) {
      return {
        content: `죄송해요, "${query}"에 대한 정보를 찾을 수 없습니다. 🤔\n\n다른 방식으로 질문해주시거나, 도움말을 요청해주세요!`,
        isSuccess: false,
        dataSource: 'static',
        timestamp: new Date(),
        confidence: 0.1
      };
    }

    const bestMatch = staticResults[0];
    let content = bestMatch.item.answer;

    if (staticResults.length > 1) {
      content += '\n\n📚 관련 질문들:\n';
      content += staticResults.slice(1, 3).map((result, index) => 
        `${index + 1}. ${result.item.question}`
      ).join('\n');
    }

    return {
      content,
      isSuccess: true,
      dataSource: 'static',
      timestamp: new Date(),
      confidence: bestMatch.score
    };
  }

  private createErrorResponse(query: string): DynamicResponse {
    return {
      content: `죄송합니다. 요청을 처리하는 중 문제가 발생했습니다. 🛠️\n\n잠시 후 다시 시도해주세요.`,
      isSuccess: false,
      dataSource: 'static',
      timestamp: new Date(),
      confidence: 0.0
    };
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString();
  }
}