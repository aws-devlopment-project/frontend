import { Injectable, computed, signal } from '@angular/core';
import { SharedStateService } from './SharedService';
import { UserService } from './UserService';
import { LocalActivityService } from '../../DashBoard/Service/LocalActivityService';

@Injectable({
  providedIn: 'root'
})
export class DonationPointsService {
  private _userPoints = signal<number>(0);
  
  // 포인트를 computed로 노출
  readonly userPoints = computed(() => this._userPoints());
  
  constructor(
    private sharedService: SharedStateService,
    private userService: UserService,
    private activityService: LocalActivityService
  ) {
    this.initializePoints();
  }

  private async initializePoints(): Promise<void> {
    try {
      // 실제 사용자 상태에서 포인트 로드 (예시)
      const userStatus = await this.userService.getUserStatus();
      if (userStatus) {
        // UserStatus에 points 필드가 있다고 가정하거나, 다른 방식으로 포인트 계산
        const calculatedPoints = await this.calculateUserPoints();
        this._userPoints.set(calculatedPoints);
      }
    } catch (error) {
      console.error('Failed to initialize points:', error);
      this._userPoints.set(50000); // 기본값
    }
  }

  private async calculateUserPoints(): Promise<number> {
    try {
      // 활동 기반 포인트 계산
      const activityStats = this.activityService.getActivityStats();
      let points = activityStats.totalPoints;
      
      // 퀘스트 완료 보너스
      const questStats = await this.activityService.getQuestBasedStats();
      points += questStats.completedQuests * 100;
      
      // 그룹 참여 보너스
      const groupStats = await this.activityService.getGroupParticipationStats();
      points += groupStats.totalGroups * 500;
      points += groupStats.totalClubs * 200;
      
      return Math.max(points, 10000); // 최소 1만 포인트 보장
    } catch (error) {
      console.error('Error calculating points:', error);
      return 50000; // 기본값
    }
  }

  // 포인트 차감
  async deductPoints(amount: number, reason: string = 'donation'): Promise<boolean> {
    const currentPoints = this._userPoints();
    
    if (currentPoints < amount) {
      return false;
    }

    try {
      // 실제 백엔드 API 호출 (예시)
      const success = await this.updatePointsOnServer(-amount, reason);
      
      if (success) {
        this._userPoints.set(currentPoints - amount);
        
        // 활동 기록
        this.activityService.trackActivity(
          'quest_complete',
          `포인트 기부`,
          `${amount}P를 기부하여 선한 영향력을 실천했습니다.`,
          { points: amount, reason }
        );
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to deduct points:', error);
      return false;
    }
  }

  // 포인트 추가 (보상 등)
  async addPoints(amount: number, reason: string = 'reward'): Promise<void> {
    try {
      const success = await this.updatePointsOnServer(amount, reason);
      
      if (success) {
        this._userPoints.update(current => current + amount);
        
        this.activityService.trackActivity(
          'quest_complete',
          `포인트 획득`,
          `${reason}으로 ${amount}P를 획득했습니다.`,
          { points: amount, reason }
        );
      }
    } catch (error) {
      console.error('Failed to add points:', error);
    }
  }

  // 포인트 새로고침
  async refreshPoints(): Promise<void> {
    const newPoints = await this.calculateUserPoints();
    this._userPoints.set(newPoints);
  }

  private async updatePointsOnServer(amount: number, reason: string): Promise<boolean> {
    try {
      // 실제 구현에서는 UserService를 통해 서버 업데이트
      // await this.userService.updateUserPoints(amount, reason);
      return true;
    } catch (error) {
      console.error('Failed to update points on server:', error);
      return false;
    }
  }
}