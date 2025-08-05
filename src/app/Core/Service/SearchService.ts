// SearchService.ts
import { Injectable } from '@angular/core';
import { UserService } from './UserService';
import { UserJoinList } from '../Models/user';
import { DebugService } from '../../Debug/DebugService';

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  type: 'group' | 'club';
  icon?: string;
  groupName?: string; // 클럽인 경우 소속 그룹명
}

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  private userJoinList: UserJoinList | null = null;

  constructor(private userService: UserService, private debugService: DebugService) {
    this.initializeData();
  }

  private async initializeData(): Promise<void> {
    try {
      this.userJoinList = await this.userService.getUserJoinList();
    } catch (error) {
      this.debugService.printConsole('Error loading user join list in SearchService:', error);
    }
  }

  async searchChannel(query: string): Promise<SearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    // userJoinList가 없으면 다시 로드 시도
    if (!this.userJoinList) {
      await this.initializeData();
    }

    if (!this.userJoinList) {
      return [];
    }

    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase().trim();

    // 그룹 검색
    this.userJoinList.joinList.forEach((group, groupIndex) => {
      if (group.groupname.toLowerCase().includes(queryLower)) {
        results.push({
          id: `group_${groupIndex}_${group.groupname}`, // 고유한 ID 생성
          title: group.groupname,
          description: `그룹 • ${group.clubList.length}개의 채널`,
          type: 'group',
          icon: 'group'
        });
      }

      // 채널(클럽) 검색
      group.clubList.forEach((club, clubIndex) => {
        if (club.toLowerCase().includes(queryLower)) {
          results.push({
            id: `club_${groupIndex}_${clubIndex}_${club}`, // 고유한 ID 생성
            title: club,
            description: `${group.groupname} 그룹의 채널`,
            type: 'club',
            icon: 'tag',
            groupName: group.groupname
          });
        }
      });
    });

    // 결과를 관련성 순으로 정렬 (정확히 일치하는 것을 먼저)
    return results.sort((a, b) => {
      const aExact = a.title.toLowerCase() === queryLower;
      const bExact = b.title.toLowerCase() === queryLower;
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // 타입별 우선순위 (그룹 > 클럽)
      if (a.type !== b.type) {
        return a.type === 'group' ? -1 : 1;
      }
      
      return a.title.localeCompare(b.title);
    });
  }

  async refreshData(): Promise<void> {
    await this.initializeData();
  }
}