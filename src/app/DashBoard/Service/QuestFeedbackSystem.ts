// QuestFeedbackService.ts - 퀘스트 피드백 저장 및 관리 서비스
import { Injectable } from '@angular/core';

export interface QuestFeedback {
  quest: string;
  group: string;
  club: string;
  createTime: Date;
  user: string;
  feedbackScore: number;
  id?: string; // 자동 생성되는 고유 ID
}

export interface FeedbackStats {
  totalFeedbacks: number;
  averageScore: number;
  scoreDistribution: { [score: number]: number };
  topRatedQuests: { quest: string; group: string; averageScore: number; count: number }[];
  recentFeedbacks: QuestFeedback[];
}

@Injectable({
  providedIn: 'root'
})
export class QuestFeedbackService {
  private readonly STORAGE_KEY = 'quest_feedbacks';
  private readonly MAX_FEEDBACKS = 1000; // 최대 저장할 피드백 수

  constructor() {
    this.initializeStorage();
  }

  // === 초기화 ===
  
  private initializeStorage(): void {
    try {
      const existing = localStorage.getItem(this.STORAGE_KEY);
      if (!existing) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
        console.log('Quest feedback storage initialized');
      }
    } catch (error) {
      console.error('Error initializing quest feedback storage:', error);
    }
  }

  // === 피드백 저장 ===

  saveFeedback(feedback: Omit<QuestFeedback, 'id' | 'createTime'>): string | null {
    try {
      const feedbackWithMeta: QuestFeedback = {
        ...feedback,
        id: this.generateId(),
        createTime: new Date()
      };

      const existingFeedbacks = this.loadFeedbacks();
      existingFeedbacks.push(feedbackWithMeta);

      // 최대 개수 제한
      if (existingFeedbacks.length > this.MAX_FEEDBACKS) {
        existingFeedbacks.splice(0, existingFeedbacks.length - this.MAX_FEEDBACKS);
      }

      this.saveFeedbacks(existingFeedbacks);
      
      console.log('Quest feedback saved:', {
        id: feedbackWithMeta.id,
        quest: feedback.quest,
        score: feedback.feedbackScore
      });

      return feedbackWithMeta.id!;
    } catch (error) {
      console.error('Error saving quest feedback:', error);
      return null;
    }
  }

  // === 피드백 조회 ===

  getAllFeedbacks(): QuestFeedback[] {
    return this.loadFeedbacks();
  }

  getFeedbackById(id: string): QuestFeedback | null {
    const feedbacks = this.loadFeedbacks();
    return feedbacks.find(feedback => feedback.id === id) || null;
  }

  getFeedbacksByUser(userId: string): QuestFeedback[] {
    const feedbacks = this.loadFeedbacks();
    return feedbacks.filter(feedback => feedback.user === userId);
  }

  getFeedbacksByGroup(groupName: string): QuestFeedback[] {
    const feedbacks = this.loadFeedbacks();
    return feedbacks.filter(feedback => feedback.group === groupName);
  }

  getFeedbacksByQuest(questName: string, groupName?: string): QuestFeedback[] {
    const feedbacks = this.loadFeedbacks();
    return feedbacks.filter(feedback => {
      const questMatch = feedback.quest === questName;
      const groupMatch = !groupName || feedback.group === groupName;
      return questMatch && groupMatch;
    });
  }

  getRecentFeedbacks(limit: number = 10): QuestFeedback[] {
    const feedbacks = this.loadFeedbacks();
    return feedbacks
      .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime())
      .slice(0, limit);
  }

  // === 피드백 통계 ===

  getFeedbackStats(userId?: string, groupName?: string): FeedbackStats {
    let feedbacks = this.loadFeedbacks();

    // 필터 적용
    if (userId) {
      feedbacks = feedbacks.filter(f => f.user === userId);
    }
    if (groupName) {
      feedbacks = feedbacks.filter(f => f.group === groupName);
    }

    if (feedbacks.length === 0) {
      return {
        totalFeedbacks: 0,
        averageScore: 0,
        scoreDistribution: {},
        topRatedQuests: [],
        recentFeedbacks: []
      };
    }

    // 기본 통계
    const totalFeedbacks = feedbacks.length;
    const totalScore = feedbacks.reduce((sum, f) => sum + f.feedbackScore, 0);
    const averageScore = Math.round((totalScore / totalFeedbacks) * 10) / 10;

    // 점수 분포
    const scoreDistribution: { [score: number]: number } = {};
    feedbacks.forEach(feedback => {
      const score = feedback.feedbackScore;
      scoreDistribution[score] = (scoreDistribution[score] || 0) + 1;
    });

    // 상위 평가 퀘스트
    const questScores: { [key: string]: { total: number; count: number; group: string } } = {};
    feedbacks.forEach(feedback => {
      const key = `${feedback.quest}|${feedback.group}`;
      if (!questScores[key]) {
        questScores[key] = { total: 0, count: 0, group: feedback.group };
      }
      questScores[key].total += feedback.feedbackScore;
      questScores[key].count += 1;
    });

    const topRatedQuests = Object.entries(questScores)
      .map(([key, data]) => {
        const [quest] = key.split('|');
        return {
          quest,
          group: data.group,
          averageScore: Math.round((data.total / data.count) * 10) / 10,
          count: data.count
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 10);

    // 최근 피드백
    const recentFeedbacks = feedbacks
      .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime())
      .slice(0, 5);

    return {
      totalFeedbacks,
      averageScore,
      scoreDistribution,
      topRatedQuests,
      recentFeedbacks
    };
  }

  // === 데이터 분석 메서드 ===

  getQuestAverageScore(questName: string, groupName?: string): number {
    const feedbacks = this.getFeedbacksByQuest(questName, groupName);
    if (feedbacks.length === 0) return 0;
    
    const total = feedbacks.reduce((sum, f) => sum + f.feedbackScore, 0);
    return Math.round((total / feedbacks.length) * 10) / 10;
  }

  getUserAverageScore(userId: string): number {
    const feedbacks = this.getFeedbacksByUser(userId);
    if (feedbacks.length === 0) return 0;
    
    const total = feedbacks.reduce((sum, f) => sum + f.feedbackScore, 0);
    return Math.round((total / feedbacks.length) * 10) / 10;
  }

  getGroupAverageScore(groupName: string): number {
    const feedbacks = this.getFeedbacksByGroup(groupName);
    if (feedbacks.length === 0) return 0;
    
    const total = feedbacks.reduce((sum, f) => sum + f.feedbackScore, 0);
    return Math.round((total / feedbacks.length) * 10) / 10;
  }

  // === 피드백 관리 ===

  updateFeedback(id: string, updates: Partial<QuestFeedback>): boolean {
    try {
      const feedbacks = this.loadFeedbacks();
      const index = feedbacks.findIndex(f => f.id === id);
      
      if (index === -1) {
        console.warn('Feedback not found for update:', id);
        return false;
      }

      feedbacks[index] = { ...feedbacks[index], ...updates };
      this.saveFeedbacks(feedbacks);
      
      console.log('Feedback updated:', id);
      return true;
    } catch (error) {
      console.error('Error updating feedback:', error);
      return false;
    }
  }

  deleteFeedback(id: string): boolean {
    try {
      const feedbacks = this.loadFeedbacks();
      const filteredFeedbacks = feedbacks.filter(f => f.id !== id);
      
      if (filteredFeedbacks.length === feedbacks.length) {
        console.warn('Feedback not found for deletion:', id);
        return false;
      }

      this.saveFeedbacks(filteredFeedbacks);
      console.log('Feedback deleted:', id);
      return true;
    } catch (error) {
      console.error('Error deleting feedback:', error);
      return false;
    }
  }

  clearAllFeedbacks(): boolean {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
      console.log('All feedbacks cleared');
      return true;
    } catch (error) {
      console.error('Error clearing feedbacks:', error);
      return false;
    }
  }

  clearUserFeedbacks(userId: string): number {
    try {
      const feedbacks = this.loadFeedbacks();
      const filteredFeedbacks = feedbacks.filter(f => f.user !== userId);
      const deletedCount = feedbacks.length - filteredFeedbacks.length;
      
      this.saveFeedbacks(filteredFeedbacks);
      console.log(`${deletedCount} user feedbacks cleared for user:`, userId);
      return deletedCount;
    } catch (error) {
      console.error('Error clearing user feedbacks:', error);
      return 0;
    }
  }

  // === 데이터 가져오기/내보내기 ===

  exportFeedbacks(): string {
    try {
      const feedbacks = this.loadFeedbacks();
      return JSON.stringify(feedbacks, null, 2);
    } catch (error) {
      console.error('Error exporting feedbacks:', error);
      return '[]';
    }
  }

  importFeedbacks(jsonData: string): { success: boolean; imported: number; errors: number } {
    try {
      const importedData = JSON.parse(jsonData) as QuestFeedback[];
      
      if (!Array.isArray(importedData)) {
        throw new Error('Invalid data format');
      }

      const existingFeedbacks = this.loadFeedbacks();
      let imported = 0;
      let errors = 0;

      importedData.forEach(feedback => {
        try {
          if (this.validateFeedback(feedback)) {
            existingFeedbacks.push({
              ...feedback,
              id: feedback.id || this.generateId(),
              createTime: new Date(feedback.createTime)
            });
            imported++;
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      });

      // 최대 개수 제한 적용
      if (existingFeedbacks.length > this.MAX_FEEDBACKS) {
        existingFeedbacks.splice(0, existingFeedbacks.length - this.MAX_FEEDBACKS);
      }

      this.saveFeedbacks(existingFeedbacks);
      console.log(`Feedbacks imported: ${imported}, errors: ${errors}`);
      
      return { success: true, imported, errors };
    } catch (error) {
      console.error('Error importing feedbacks:', error);
      return { success: false, imported: 0, errors: 0 };
    }
  }

  // === 내부 유틸리티 메서드 ===

  private loadFeedbacks(): QuestFeedback[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      // Date 객체 복원
      return parsed.map((feedback: any) => ({
        ...feedback,
        createTime: new Date(feedback.createTime)
      }));
    } catch (error) {
      console.error('Error loading feedbacks:', error);
      return [];
    }
  }

  private saveFeedbacks(feedbacks: QuestFeedback[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(feedbacks));
    } catch (error) {
      console.error('Error saving feedbacks:', error);
    }
  }

  private validateFeedback(feedback: any): feedback is QuestFeedback {
    return feedback &&
           typeof feedback.quest === 'string' &&
           typeof feedback.group === 'string' &&
           typeof feedback.club === 'string' &&
           typeof feedback.user === 'string' &&
           typeof feedback.feedbackScore === 'number' &&
           feedback.feedbackScore >= 1 &&
           feedback.feedbackScore <= 5 &&
           feedback.createTime;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // === 디버깅 메서드 ===

  getStorageInfo(): { 
    totalFeedbacks: number; 
    storageSize: number; 
    oldestFeedback?: Date; 
    newestFeedback?: Date; 
  } {
    try {
      const feedbacks = this.loadFeedbacks();
      const storedData = localStorage.getItem(this.STORAGE_KEY) || '';
      
      const dates = feedbacks.map(f => new Date(f.createTime));
      const oldestFeedback = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : undefined;
      const newestFeedback = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : undefined;

      return {
        totalFeedbacks: feedbacks.length,
        storageSize: new Blob([storedData]).size,
        oldestFeedback,
        newestFeedback
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return { totalFeedbacks: 0, storageSize: 0 };
    }
  }

  logFeedbackStats(): void {
    console.group('=== Quest Feedback Statistics ===');
    
    const stats = this.getFeedbackStats();
    console.log('Total Feedbacks:', stats.totalFeedbacks);
    console.log('Average Score:', stats.averageScore);
    console.log('Score Distribution:', stats.scoreDistribution);
    console.log('Top Rated Quests:', stats.topRatedQuests.slice(0, 3));
    
    const storageInfo = this.getStorageInfo();
    console.log('Storage Size:', `${Math.round(storageInfo.storageSize / 1024)}KB`);
    
    if (storageInfo.oldestFeedback && storageInfo.newestFeedback) {
      console.log('Date Range:', 
        `${storageInfo.oldestFeedback.toLocaleDateString()} - ${storageInfo.newestFeedback.toLocaleDateString()}`
      );
    }
    
    console.groupEnd();
  }
}