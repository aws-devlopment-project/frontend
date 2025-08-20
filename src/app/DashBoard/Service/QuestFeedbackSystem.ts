import { Injectable } from '@angular/core';

export interface QuestFeedback {
  id: string;
  quest: string;
  group: string;
  club: string;
  user: string;
  feedbackScore: number; // 기존 호환성을 위해 유지 (좋아요=1, 싫어요=0, 점수피드백=1-5)
  feedbackText?: string; // 텍스트 피드백 필드
  isLike?: boolean; // 좋아요/싫어요 정보 (true=좋아요, false=싫어요)
  createTime: Date;
  metadata?: {
    source?: string;
    version?: string;
    questCount?: number;
    submissionMethod?: 'rating' | 'text' | 'like_text'; // 피드백 방식 구분
    sentiment?: 'positive' | 'negative' | 'neutral'; // 감정 분석
    isLike?: boolean; // metadata에도 isLike 추가 (백업용)
    originalScore?: number; // 원본 점수 (변환 전)
  };
}

@Injectable({
  providedIn: 'root'
})
export class QuestFeedbackService {
  private readonly STORAGE_KEY = 'quest_feedback_data';
  private readonly MAX_FEEDBACK_ITEMS = 1000;

  constructor() {
    this.initializeStorage();
  }

  private initializeStorage(): void {
    if (!localStorage.getItem(this.STORAGE_KEY)) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
    }
  }

  // 피드백 저장 (좋아요/싫어요 + 텍스트 피드백 지원)
  saveFeedback(feedback: Omit<QuestFeedback, 'id' | 'createTime'>): string | null {
    try {
      const id = this.generateId();
      const now = new Date();
      
      // 피드백 유형 결정
      let submissionMethod: 'rating' | 'text' | 'like_text' = 'rating';
      let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
      
      if (feedback.isLike !== undefined && feedback.feedbackText && feedback.feedbackText.trim().length > 0) {
        submissionMethod = 'like_text';
        sentiment = feedback.isLike ? 'positive' : 'negative';
      } else if (feedback.feedbackText && feedback.feedbackText.trim().length > 0) {
        submissionMethod = 'text';
        sentiment = this.analyzeSentiment(feedback.feedbackText);
      } else if (feedback.feedbackScore > 0) {
        submissionMethod = 'rating';
        sentiment = feedback.feedbackScore >= 4 ? 'positive' : 
                   feedback.feedbackScore <= 2 ? 'negative' : 'neutral';
      }

      const newFeedback: QuestFeedback = {
        ...feedback,
        id,
        createTime: now,
        isLike: feedback.isLike, // 루트 레벨에 명시적으로 설정
        metadata: {
          source: 'group_dashboard',
          version: '2.0',
          submissionMethod,
          sentiment,
          isLike: feedback.isLike, // metadata에도 백업
          ...feedback.metadata
        }
      };

      // 기존 피드백 목록 가져오기
      const existingFeedbacks = this.getAllFeedbacks();
      
      // 새 피드백 추가 (최신순)
      const updatedFeedbacks = [newFeedback, ...existingFeedbacks]
        .slice(0, this.MAX_FEEDBACK_ITEMS);

      // 저장
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedFeedbacks));

      return id;

    } catch (error) {
      console.error('Error saving feedback:', error);
      return null;
    }
  }

  // 간단한 감정 분석 (키워드 기반)
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = [
      '좋', '훌륭', '완벽', '최고', '만족', '감사', '성공', '달성', 
      '즐거', '재미', '쉬운', '명확', '도움', '유용', '효과', '뿌듯'
    ];
    
    const negativeWords = [
      '나쁜', '어려', '힘든', '복잡', '불만', '실망', '아쉬', '부족',
      '문제', '오류', '실패', '포기', '짜증', '불편', '애매', '모호'
    ];
    
    const lowerText = text.toLowerCase();
    
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  // 모든 피드백 조회
  getAllFeedbacks(): QuestFeedback[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];

      const feedbacks = JSON.parse(stored);
      
      // createTime을 Date 객체로 변환
      return feedbacks.map((feedback: any) => ({
        ...feedback,
        createTime: new Date(feedback.createTime)
      }));

    } catch (error) {
      console.error('Error loading feedbacks:', error);
      return [];
    }
  }

  // 특정 그룹의 피드백 조회
  getFeedbacksByGroup(groupName: string): QuestFeedback[] {
    return this.getAllFeedbacks().filter(feedback => feedback.group === groupName);
  }

  // 특정 퀘스트의 피드백 조회
  getFeedbacksByQuest(questName: string, groupName?: string): QuestFeedback[] {
    const allFeedbacks = this.getAllFeedbacks();
    
    return allFeedbacks.filter(feedback => {
      const questMatch = feedback.quest === questName;
      const groupMatch = !groupName || feedback.group === groupName;
      return questMatch && groupMatch;
    });
  }

  // 사용자별 피드백 조회
  getFeedbacksByUser(userId: string, groupName?: string): QuestFeedback[] {
    const allFeedbacks = this.getAllFeedbacks();
    
    return allFeedbacks.filter(feedback => {
      const userMatch = feedback.user === userId;
      const groupMatch = !groupName || feedback.group === groupName;
      return userMatch && groupMatch;
    });
  }

  // 좋아요 피드백만 조회
  getLikeFeedbacks(groupName?: string): QuestFeedback[] {
    return this.getAllFeedbacks().filter(feedback => {
      const isLike = feedback.isLike === true;
      const groupMatch = !groupName || feedback.group === groupName;
      return isLike && groupMatch;
    });
  }

  // 싫어요 피드백만 조회
  getDislikeFeedbacks(groupName?: string): QuestFeedback[] {
    return this.getAllFeedbacks().filter(feedback => {
      const isDislike = feedback.isLike === false;
      const groupMatch = !groupName || feedback.group === groupName;
      return isDislike && groupMatch;
    });
  }

  // 좋아요/싫어요 피드백 조회 (텍스트 포함)
  getLikeDislikeFeedbacks(groupName?: string): QuestFeedback[] {
    return this.getAllFeedbacks().filter(feedback => {
      const hasLikeDislike = feedback.isLike !== undefined;
      const groupMatch = !groupName || feedback.group === groupName;
      return hasLikeDislike && groupMatch;
    });
  }

  // 감정별 피드백 조회
  getFeedbacksBySentiment(sentiment: 'positive' | 'negative' | 'neutral', groupName?: string): QuestFeedback[] {
    return this.getAllFeedbacks().filter(feedback => {
      const sentimentMatch = feedback.metadata?.sentiment === sentiment;
      const groupMatch = !groupName || feedback.group === groupName;
      return sentimentMatch && groupMatch;
    });
  }

  // 텍스트 피드백만 조회
  getTextFeedbacks(groupName?: string): QuestFeedback[] {
    return this.getAllFeedbacks().filter(feedback => {
      const hasText = feedback.feedbackText && feedback.feedbackText.trim().length > 0;
      const groupMatch = !groupName || feedback.group === groupName;
      return hasText && groupMatch;
    });
  }

  // 피드백 통계 생성 (좋아요/싫어요 포함)
  getFeedbackStats(groupName?: string): {
    total: number;
    textFeedbacks: number;
    ratingFeedbacks: number;
    likeFeedbacks: number;
    dislikeFeedbacks: number;
    averageRating: number;
    likeRatio: number;
    recentFeedbacks: number; // 최근 7일
    sentimentDistribution: {
      positive: number;
      negative: number;
      neutral: number;
    };
    questFeedbackCounts: { [questName: string]: number };
    userParticipation: { [userId: string]: number };
  } {
    const feedbacks = groupName 
      ? this.getFeedbacksByGroup(groupName)
      : this.getAllFeedbacks();

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const textFeedbacks = feedbacks.filter(f => 
      f.feedbackText && f.feedbackText.trim().length > 0
    );

    const ratingFeedbacks = feedbacks.filter(f => 
      f.feedbackScore > 0 && f.metadata?.submissionMethod === 'rating'
    );

    const likeFeedbacks = feedbacks.filter(f => f.isLike === true);
    const dislikeFeedbacks = feedbacks.filter(f => f.isLike === false);

    const recentFeedbacks = feedbacks.filter(f => f.createTime >= sevenDaysAgo);

    const questCounts: { [questName: string]: number } = {};
    const userCounts: { [userId: string]: number } = {};

    feedbacks.forEach(feedback => {
      questCounts[feedback.quest] = (questCounts[feedback.quest] || 0) + 1;
      userCounts[feedback.user] = (userCounts[feedback.user] || 0) + 1;
    });

    const ratingSum = ratingFeedbacks.reduce((sum, f) => sum + f.feedbackScore, 0);
    const averageRating = ratingFeedbacks.length > 0 
      ? Math.round((ratingSum / ratingFeedbacks.length) * 10) / 10 
      : 0;

    const totalLikeDislike = likeFeedbacks.length + dislikeFeedbacks.length;
    const likeRatio = totalLikeDislike > 0 
      ? Math.round((likeFeedbacks.length / totalLikeDislike) * 100) 
      : 0;

    // 감정 분포 계산
    const sentimentDistribution = {
      positive: feedbacks.filter(f => f.metadata?.sentiment === 'positive').length,
      negative: feedbacks.filter(f => f.metadata?.sentiment === 'negative').length,
      neutral: feedbacks.filter(f => f.metadata?.sentiment === 'neutral').length
    };

    return {
      total: feedbacks.length,
      textFeedbacks: textFeedbacks.length,
      ratingFeedbacks: ratingFeedbacks.length,
      likeFeedbacks: likeFeedbacks.length,
      dislikeFeedbacks: dislikeFeedbacks.length,
      averageRating,
      likeRatio,
      recentFeedbacks: recentFeedbacks.length,
      sentimentDistribution,
      questFeedbackCounts: questCounts,
      userParticipation: userCounts
    };
  }

  // 최근 피드백 조회 (최신 N개)
  getRecentFeedbacks(limit: number = 10, groupName?: string): QuestFeedback[] {
    const feedbacks = groupName 
      ? this.getFeedbacksByGroup(groupName)
      : this.getAllFeedbacks();

    return feedbacks
      .sort((a, b) => b.createTime.getTime() - a.createTime.getTime())
      .slice(0, limit);
  }

  // 피드백 삭제
  deleteFeedback(feedbackId: string): boolean {
    try {
      const feedbacks = this.getAllFeedbacks();
      const updatedFeedbacks = feedbacks.filter(f => f.id !== feedbackId);
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedFeedbacks));
      return true;

    } catch (error) {
      console.error('Error deleting feedback:', error);
      return false;
    }
  }

  // 특정 조건의 피드백 삭제 (예: 오래된 피드백 정리)
  cleanupOldFeedbacks(daysOld: number = 90): number {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const feedbacks = this.getAllFeedbacks();
      const recentFeedbacks = feedbacks.filter(f => f.createTime >= cutoffDate);
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentFeedbacks));
      
      const deletedCount = feedbacks.length - recentFeedbacks.length;
      
      return deletedCount;

    } catch (error) {
      console.error('Error cleaning up old feedbacks:', error);
      return 0;
    }
  }

  // 피드백 데이터 내보내기 (JSON)
  exportFeedbacks(groupName?: string): string {
    const feedbacks = groupName 
      ? this.getFeedbacksByGroup(groupName)
      : this.getAllFeedbacks();

    const exportData = {
      exportedAt: new Date().toISOString(),
      groupName: groupName || 'all',
      feedbackCount: feedbacks.length,
      feedbacks: feedbacks
    };

    return JSON.stringify(exportData, null, 2);
  }

  // 피드백 데이터 가져오기
  importFeedbacks(jsonData: string): { success: boolean; imported: number; errors: string[] } {
    try {
      const data = JSON.parse(jsonData);
      const errors: string[] = [];
      let imported = 0;

      if (!data.feedbacks || !Array.isArray(data.feedbacks)) {
        throw new Error('Invalid import data format');
      }

      const existingFeedbacks = this.getAllFeedbacks();
      const existingIds = new Set(existingFeedbacks.map(f => f.id));

      for (const feedbackData of data.feedbacks) {
        try {
          // ID 중복 체크
          if (existingIds.has(feedbackData.id)) {
            errors.push(`Duplicate feedback ID: ${feedbackData.id}`);
            continue;
          }

          // 필수 필드 체크
          if (!feedbackData.quest || !feedbackData.group || !feedbackData.user) {
            errors.push(`Missing required fields in feedback: ${feedbackData.id}`);
            continue;
          }

          // 날짜 변환
          const feedback: QuestFeedback = {
            ...feedbackData,
            createTime: new Date(feedbackData.createTime)
          };

          existingFeedbacks.push(feedback);
          imported++;

        } catch (error) {
          errors.push(`Error processing feedback ${feedbackData.id}: ${error}`);
        }
      }

      // 정렬 및 제한
      const sortedFeedbacks = existingFeedbacks
        .sort((a, b) => b.createTime.getTime() - a.createTime.getTime())
        .slice(0, this.MAX_FEEDBACK_ITEMS);

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sortedFeedbacks));

      return {
        success: true,
        imported,
        errors
      };

    } catch (error) {
      return {
        success: false,
        imported: 0,
        errors: [error instanceof Error ? error.message : 'Unknown import error']
      };
    }
  }

  // 유틸리티: ID 생성
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 점수 피드백만 조회 (기존 호환성)
  getRatingFeedbacks(groupName?: string): QuestFeedback[] {
    return this.getAllFeedbacks().filter(feedback => {
      const hasRating = feedback.feedbackScore > 0;
      const isRatingOnly = feedback.metadata?.submissionMethod === 'rating';
      const groupMatch = !groupName || feedback.group === groupName;
      return hasRating && isRatingOnly && groupMatch;
    });
  }

  // 피드백 유효성 검사 (좋아요/싫어요 지원)
  validateFeedback(feedback: Partial<QuestFeedback>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!feedback.quest || feedback.quest.trim().length === 0) {
      errors.push('퀘스트 이름이 필요합니다.');
    }

    if (!feedback.group || feedback.group.trim().length === 0) {
      errors.push('그룹 이름이 필요합니다.');
    }

    if (!feedback.user || feedback.user.trim().length === 0) {
      errors.push('사용자 ID가 필요합니다.');
    }

    // 피드백 내용 체크 (점수, 텍스트, 좋아요/싫어요 중 하나는 있어야 함)
    const hasRating = feedback.feedbackScore && feedback.feedbackScore > 0;
    const hasText = feedback.feedbackText && feedback.feedbackText.trim().length > 0;
    const hasLikeDislike = feedback.isLike !== undefined;

    if (!hasRating && !hasText && !hasLikeDislike) {
      errors.push('피드백 점수, 텍스트, 또는 좋아요/싫어요 중 하나는 입력해야 합니다.');
    }

    // 좋아요/싫어요 + 텍스트 조합 체크
    if (hasLikeDislike && !hasText) {
      errors.push('좋아요/싫어요를 선택한 경우 텍스트 피드백도 함께 작성해야 합니다.');
    }

    // 텍스트 길이 체크
    if (feedback.feedbackText) {
      const textLength = feedback.feedbackText.trim().length;
      if (textLength > 0 && textLength < 5) {
        errors.push('피드백 텍스트는 최소 5자 이상이어야 합니다.');
      }
      if (textLength > 200) {
        errors.push('피드백 텍스트는 최대 200자까지 입력 가능합니다.');
      }
    }

    // 점수 범위 체크
    if (hasRating && (feedback.feedbackScore! < 1 || feedback.feedbackScore! > 5)) {
      errors.push('피드백 점수는 1-5 범위여야 합니다.');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 피드백 통계 로깅 (좋아요/싫어요 포함)
  logFeedbackStats(groupName?: string): void {
    const stats = this.getFeedbackStats(groupName);
    
    console.group('=== Feedback Statistics ===');
    console.log('Group:', groupName || 'All');
    console.log('Total Feedbacks:', stats.total);
    console.log('Text Feedbacks:', stats.textFeedbacks);
    console.log('Rating Feedbacks:', stats.ratingFeedbacks);
    console.log('Like Feedbacks:', stats.likeFeedbacks);
    console.log('Dislike Feedbacks:', stats.dislikeFeedbacks);
    console.log('Like Ratio:', stats.likeRatio + '%');
    console.log('Average Rating:', stats.averageRating);
    console.log('Recent Feedbacks (7 days):', stats.recentFeedbacks);
    console.log('Sentiment Distribution:', stats.sentimentDistribution);
    console.log('Quest Feedback Counts:', stats.questFeedbackCounts);
    console.log('User Participation:', stats.userParticipation);
    console.groupEnd();
  }
}