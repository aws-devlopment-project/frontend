import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SharedStateService } from '../Service/SharedService';
import { DebugService } from '../../Debug/DebugService';

@Injectable({
  providedIn: 'root'
})
export class GroupGuard implements CanActivate {
  
  constructor(
    private shared: SharedStateService,
    private router: Router,
    private debugService: DebugService
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    const selectedGroup = this.shared.selectedGroup();
    const hasJoinedGroups = this.checkUserHasGroups();

    this.debugService.printConsole('GroupGuard 체크:', {
      selectedGroup,
      hasJoinedGroups,
      targetUrl: state.url
    });

    // 1. 선택된 그룹이 있으면 접근 허용
    if (selectedGroup) {
      return true;
    }

    // 2. 참여한 그룹이 있으면 첫 번째 그룹을 자동 선택
    if (hasJoinedGroups) {
      const joinedGroups = this.getJoinedGroups();
      if (joinedGroups.length > 0) {
        this.debugService.printConsole('자동 그룹 선택:', joinedGroups[0].groupId);
        this.shared.setSelectedGroup(joinedGroups[0].groupId);
        
        // 첫 번째 채널도 자동 선택
        if (joinedGroups[0].channels && joinedGroups[0].channels.length > 0) {
          this.shared.setSelectedChannel(joinedGroups[0].channels[0], joinedGroups[0].groupId);
        }
        
        return true;
      }
    }

    // 3. 참여한 그룹이 없으면 그룹 참여 페이지로 리다이렉트
    this.debugService.printConsole('참여한 그룹이 없음. 그룹 참여 페이지로 리다이렉트');
    this.router.navigate(['/group/join']);
    return false;
  }

  private checkUserHasGroups(): boolean {
    try {
      const joinedGroups = localStorage.getItem('joinedGroups');
      if (joinedGroups && JSON.parse(joinedGroups).length) {
        return true;
      }
      return false;
    } catch (error) {
      this.debugService.printConsole('참여 그룹 확인 실패:', error);
      return false;
    }
  }

  private getJoinedGroups(): any[] {
    try {
      const joinedGroups = localStorage.getItem('joinedGroups');
      return joinedGroups ? JSON.parse(joinedGroups) : [];
    } catch (error) {
      this.debugService.printConsole('참여 그룹 조회 실패:', error);
      return [];
    }
  }
}