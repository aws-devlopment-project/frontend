import { Injectable } from '@angular/core';
import { Quest } from '../../DashBoard/Models/GroupDashboardModels';

export interface OfflineQuestCompletion {
  questId: string;
  questTitle: string;
  groupName: string;
  userId: string;
  completedAt: string;
  status: 'pending_sync' | 'syncing' | 'sync_failed';
  retryCount?: number;
  lastSyncAttempt?: string;
}

export interface OfflineQuestStats {
  totalPending: number;
  syncFailed: number;
  lastSyncTime?: Date;
  isOnline: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineQuestService {
  private readonly STORAGE_KEY = 'offline_quest_completions';
  private readonly MAX_RETRY_COUNT = 3;
  private readonly SYNC_DEBOUNCE_MS = 1000;
  
  private lastSyncTime = 0;
  private isOnline = navigator.onLine;

  constructor() {
    this.initializeService();
    this.setupOnlineListener();
  }

  private initializeService(): void {
    // 로컬 스토리지 초기화
    if (!localStorage.getItem(this.STORAGE_KEY)) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
    }
    
    console.log('🔧 OfflineQuestService 초기화 완료');
  }

  private setupOnlineListener(): void {
    // 온라인/오프라인 상태 감지
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('🌐 네트워크 연결됨 - 자동 동기화 시도');
      this.autoSyncAfterOnline();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📱 오프라인 모드 활성화');
    });
  }

  /**
   * 에러가 오프라인 모드를 사용해야 하는 상황인지 판단
   */
  shouldUseOfflineMode(error: any): boolean {
    if (!error) return false;

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('500') || 
             message.includes('internal server error') ||
             message.includes('network') ||
             message.includes('failed to fetch') ||
             message.includes('connection') ||
             message.includes('timeout') ||
             message.includes('abort');
    }

    // HTTP 에러 응답 체크
    if (error.status) {
      return error.status >= 500 || error.status === 0; // 0은 네트워크 오류
    }

    return !this.isOnline;
  }

  /**
   * 오프라인 퀘스트 완료 저장
   */
  saveOfflineQuestCompletion(quest: Quest, groupName: string, userId: string): boolean {
    try {
      const existingCompletions = this.getOfflineCompletions();
      
      // 중복 체크
      const isDuplicate = existingCompletions.some(
        completion => completion.questId === quest.id && 
                     completion.groupName === groupName &&
                     completion.userId === userId
      );

      if (isDuplicate) {
        console.warn('⚠️ 중복된 오프라인 퀘스트 완료 요청:', quest.title);
        return false;
      }

      const completion: OfflineQuestCompletion = {
        questId: quest.id,
        questTitle: quest.title,
        groupName,
        userId,
        completedAt: new Date().toISOString(),
        status: 'pending_sync',
        retryCount: 0
      };

      existingCompletions.push(completion);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existingCompletions));

      console.log('💾 오프라인 퀘스트 완료 저장:', completion);
      return true;

    } catch (error) {
      console.error('❌ 오프라인 퀘스트 저장 실패:', error);
      return false;
    }
  }

  /**
   * 오프라인 완료 기록 조회
   */
  getOfflineCompletions(): OfflineQuestCompletion[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ 오프라인 완료 기록 조회 실패:', error);
      return [];
    }
  }

  /**
   * 특정 사용자/그룹의 오프라인 완료 기록 조회
   */
  getOfflineCompletionsByUser(userId: string, groupName?: string): OfflineQuestCompletion[] {
    return this.getOfflineCompletions().filter(completion => {
      const userMatch = completion.userId === userId;
      const groupMatch = !groupName || completion.groupName === groupName;
      return userMatch && groupMatch;
    });
  }

  /**
   * 오프라인 통계 조회
   */
  getOfflineStats(userId?: string, groupName?: string): OfflineQuestStats {
    const completions = userId 
      ? this.getOfflineCompletionsByUser(userId, groupName)
      : this.getOfflineCompletions();

    const totalPending = completions.filter(c => c.status === 'pending_sync').length;
    const syncFailed = completions.filter(c => c.status === 'sync_failed').length;

    // 마지막 동기화 시도 시간 찾기
    const lastSyncTime = completions
      .filter(c => c.lastSyncAttempt)
      .sort((a, b) => new Date(b.lastSyncAttempt!).getTime() - new Date(a.lastSyncAttempt!).getTime())[0]?.lastSyncAttempt;

    return {
      totalPending,
      syncFailed,
      lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : undefined,
      isOnline: this.isOnline
    };
  }

  /**
   * 특정 퀘스트가 오프라인 완료 대기 중인지 확인
   */
  isQuestPendingOfflineSync(questId: string, userId: string, groupName: string): boolean {
    return this.getOfflineCompletions().some(completion =>
      completion.questId === questId &&
      completion.userId === userId &&
      completion.groupName === groupName &&
      completion.status === 'pending_sync'
    );
  }

  /**
   * 오프라인 퀘스트 동기화 (Promise 기반)
   */
  async syncOfflineQuests(
    syncFunction: (userId: string, groupName: string, questTitles: string[]) => Promise<boolean>
  ): Promise<{
    success: number;
    failed: number;
    skipped: number;
    syncedQuests: string[];
    failedQuests: string[];
  }> {
    const now = Date.now();
    
    // 디바운싱
    if (now - this.lastSyncTime < this.SYNC_DEBOUNCE_MS) {
      console.log('⏱️ 동기화 디바운싱 - 너무 빠른 요청');
      return { success: 0, failed: 0, skipped: 0, syncedQuests: [], failedQuests: [] };
    }

    this.lastSyncTime = now;

    const completions = this.getOfflineCompletions();
    const pendingCompletions = completions.filter(c => c.status === 'pending_sync');

    if (pendingCompletions.length === 0) {
      console.log('📱 동기화할 오프라인 퀘스트가 없습니다.');
      return { success: 0, failed: 0, skipped: 0, syncedQuests: [], failedQuests: [] };
    }

    console.log(`🔄 ${pendingCompletions.length}개 오프라인 퀘스트 동기화 시작`);

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      syncedQuests: [] as string[],
      failedQuests: [] as string[]
    };

    // 사용자/그룹별로 그룹화
    const groupedByUserAndGroup = this.groupCompletionsByUserAndGroup(pendingCompletions);

    for (const [key, userGroupCompletions] of Object.entries(groupedByUserAndGroup)) {
      const [userId, groupName] = key.split('|');
      const questTitles = userGroupCompletions.map(c => c.questTitle);

      try {
        // 상태를 '동기화 중'으로 변경
        this.updateCompletionStatus(userGroupCompletions, 'syncing');

        console.log(`🔄 동기화 중: ${userId} - ${groupName} - ${questTitles.join(', ')}`);

        // 실제 동기화 수행
        const success = await syncFunction(userId, groupName, questTitles);

        if (success) {
          // 성공 시 완료 기록 제거
          this.removeCompletions(userGroupCompletions.map(c => c.questId));
          results.success += questTitles.length;
          results.syncedQuests.push(...questTitles);
          
          console.log(`✅ 동기화 성공: ${questTitles.join(', ')}`);
        } else {
          // 실패 시 재시도 카운트 증가
          this.handleSyncFailure(userGroupCompletions);
          results.failed += questTitles.length;
          results.failedQuests.push(...questTitles);
          
          console.error(`❌ 동기화 실패: ${questTitles.join(', ')}`);
        }

      } catch (error) {
        console.error(`❌ 동기화 오류: ${userId} - ${groupName}`, error);
        
        // 오류 시 재시도 카운트 증가
        this.handleSyncFailure(userGroupCompletions);
        results.failed += questTitles.length;
        results.failedQuests.push(...questTitles);
      }
    }

    console.log(`🔄 동기화 완료 - 성공: ${results.success}, 실패: ${results.failed}`);
    return results;
  }

  /**
   * 사용자/그룹별로 완료 기록 그룹화
   */
  private groupCompletionsByUserAndGroup(completions: OfflineQuestCompletion[]): { [key: string]: OfflineQuestCompletion[] } {
    return completions.reduce((groups, completion) => {
      const key = `${completion.userId}|${completion.groupName}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(completion);
      return groups;
    }, {} as { [key: string]: OfflineQuestCompletion[] });
  }

  /**
   * 완료 기록 상태 업데이트
   */
  private updateCompletionStatus(completions: OfflineQuestCompletion[], status: OfflineQuestCompletion['status']): void {
    const allCompletions = this.getOfflineCompletions();
    const questIds = completions.map(c => c.questId);

    const updatedCompletions = allCompletions.map(completion => {
      if (questIds.includes(completion.questId)) {
        return {
          ...completion,
          status,
          lastSyncAttempt: new Date().toISOString()
        };
      }
      return completion;
    });

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedCompletions));
  }

  /**
   * 동기화 실패 처리
   */
  private handleSyncFailure(completions: OfflineQuestCompletion[]): void {
    const allCompletions = this.getOfflineCompletions();
    const questIds = completions.map(c => c.questId);

    const updatedCompletions = allCompletions.map(completion => {
      if (questIds.includes(completion.questId)) {
        const retryCount = (completion.retryCount || 0) + 1;
        const status = retryCount >= this.MAX_RETRY_COUNT ? 'sync_failed' : 'pending_sync';
        
        return {
          ...completion,
          status,
          retryCount,
          lastSyncAttempt: new Date().toISOString()
        };
      }
      return completion;
    });

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedCompletions));
  }

  /**
   * 완료 기록 제거
   */
  private removeCompletions(questIds: string[]): void {
    const allCompletions = this.getOfflineCompletions();
    const filteredCompletions = allCompletions.filter(completion => 
      !questIds.includes(completion.questId)
    );
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredCompletions));
  }

  /**
   * 온라인 복구 후 자동 동기화 (실제 동기화 함수는 외부에서 주입)
   */
  private autoSyncAfterOnline(): void {
    // 실제 동기화는 컴포넌트에서 처리하도록 이벤트 발생
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('offline-quest-auto-sync'));
    }, 2000); // 2초 후 자동 동기화
  }

  /**
   * 실패한 퀘스트 재시도
   */
  retryFailedQuests(): number {
    const allCompletions = this.getOfflineCompletions();
    const failedCompletions = allCompletions.filter(c => c.status === 'sync_failed');

    const updatedCompletions = allCompletions.map(completion => {
      if (completion.status === 'sync_failed') {
        return {
          ...completion,
          status: 'pending_sync' as const,
          retryCount: 0
        };
      }
      return completion;
    });

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedCompletions));
    
    console.log(`🔄 ${failedCompletions.length}개 실패한 퀘스트 재시도 설정`);
    return failedCompletions.length;
  }

  /**
   * 오프라인 데이터 정리 (오래된 기록 삭제)
   */
  cleanupOldOfflineData(daysOld: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const allCompletions = this.getOfflineCompletions();
    const recentCompletions = allCompletions.filter(completion => 
      new Date(completion.completedAt) >= cutoffDate
    );

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentCompletions));

    const deletedCount = allCompletions.length - recentCompletions.length;
    
    if (deletedCount > 0) {
      console.log(`🧹 ${deletedCount}개 오래된 오프라인 기록 정리 완료`);
    }

    return deletedCount;
  }

  /**
   * 모든 오프라인 데이터 초기화 (개발/디버깅용)
   */
  clearAllOfflineData(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
    console.log('🗑️ 모든 오프라인 퀘스트 데이터 초기화');
  }

  /**
   * 오프라인 데이터 내보내기
   */
  exportOfflineData(): string {
    const completions = this.getOfflineCompletions();
    const stats = this.getOfflineStats();

    const exportData = {
      exportedAt: new Date().toISOString(),
      stats,
      completions
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 디버깅용 로그 출력
   */
  logOfflineStatus(userId?: string, groupName?: string): void {
    const stats = this.getOfflineStats(userId, groupName);
    const completions = userId ? this.getOfflineCompletionsByUser(userId, groupName) : this.getOfflineCompletions();

    console.group('=== 오프라인 퀘스트 상태 ===');
    console.log('온라인 상태:', stats.isOnline);
    console.log('대기 중인 퀘스트:', stats.totalPending);
    console.log('동기화 실패 퀘스트:', stats.syncFailed);
    console.log('마지막 동기화 시도:', stats.lastSyncTime);
    console.log('상세 기록:', completions);
    console.groupEnd();
  }
}