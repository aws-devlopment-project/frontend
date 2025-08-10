// QAKnowledgeService.ts - Q&A 파일 처리 및 지식 베이스 관리
import { Injectable } from '@angular/core';

export interface QAItem {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  confidence: number;
  embeddings?: number[]; // 향후 벡터 검색용
}

export interface QASearchResult {
  item: QAItem;
  score: number;
  matchType: 'exact' | 'keyword' | 'semantic' | 'fuzzy';
}

@Injectable({
  providedIn: 'root'
})
export class QAKnowledgeService {
  private knowledgeBase: QAItem[] = [];
  private keywordIndex: Map<string, QAItem[]> = new Map();
  private initialized = false;

  constructor() {
    this.initializeKnowledgeBase();
  }

  // Q&A 텍스트 파일 로드 및 파싱
  async loadQAFile(fileContent: string): Promise<void> {
    try {
      const qaItems = this.parseQAFile(fileContent);
      const processedItems = qaItems.map(item => this.preprocessQAItem(item));
      
      this.knowledgeBase = processedItems;
      this.buildKeywordIndex();
      this.initialized = true;
      
      console.log(`Knowledge base loaded: ${this.knowledgeBase.length} Q&A items`);
    } catch (error) {
      console.error('Failed to load Q&A file:', error);
      throw error;
    }
  }

  // 기본 Q&A 데이터 초기화 (파일이 없을 때 대체용)
  private async initializeKnowledgeBase(): Promise<void> {
    try {
      // assets 폴더에서 Q&A 파일 로드 시도
      const response = await fetch('/assets/chatbot-qa.txt');
      if (response.ok) {
        const qaContent = await response.text();
        await this.loadQAFile(qaContent);
      } else {
        // 파일이 없으면 기본 Q&A 데이터 사용
        this.loadDefaultQAData();
      }
    } catch (error) {
      console.warn('Q&A 파일을 로드할 수 없어 기본 데이터를 사용합니다:', error);
      this.loadDefaultQAData();
    }
  }

  // 기본 Q&A 데이터 (파일이 없을 때 대체용)
  private loadDefaultQAData(): void {
    const defaultQAData = `
[Question]
그룹에 어떻게 가입하나요?

[Answer]
좌측 사이드바의 "그룹 참여하기" 버튼을 클릭하거나, 홈 화면에서 관심 있는 그룹을 선택하여 가입할 수 있습니다.

[Question]
퀘스트 완료가 안됩니다

[Answer]
퀘스트 완료 버튼을 클릭한 후 잠시 기다려보세요. 네트워크 상태가 불안정하면 완료 처리가 지연될 수 있습니다.

[Question]
통계는 어디서 볼 수 있나요?

[Answer]
좌측 메뉴에서 "통계" 탭을 클릭하면 자세한 활동 통계를 확인할 수 있습니다.

[Question]
연속 기록이 끊어졌어요

[Answer]
연속 기록은 매일 최소 1개 이상의 활동을 해야 유지됩니다. 새로운 연속 기록을 다시 시작해보세요!

[Question]
채널에 참여하는 방법

[Answer]
그룹에 가입한 후, 해당 그룹 페이지에서 원하는 채널을 선택하여 참여할 수 있습니다.
`;

    try {
      this.loadQAFile(defaultQAData);
      console.log('기본 Q&A 데이터가 로드되었습니다.');
    } catch (error) {
      console.error('기본 Q&A 데이터 로드 실패:', error);
    }
  }

  // Q&A 텍스트 파일 파싱
  private parseQAFile(content: string): { question: string; answer: string }[] {
    const qaItems: { question: string; answer: string }[] = [];
    
    // 정규표현식으로 [Question]과 [Answer] 섹션 분리
    const sections = content.split(/\[Question\]|\[Answer\]/i).filter(section => section.trim());
    
    for (let i = 0; i < sections.length; i += 2) {
      const question = sections[i]?.trim();
      const answer = sections[i + 1]?.trim();
      
      if (question && answer) {
        qaItems.push({ question, answer });
      }
    }
    
    return qaItems;
  }

  // Q&A 아이템 전처리 (키워드 추출, 카테고리 분류 등)
  private preprocessQAItem(item: { question: string; answer: string }): QAItem {
    const keywords = this.extractKeywords(item.question);
    const category = this.categorizeQuestion(item.question);
    
    return {
      id: this.generateId(),
      question: item.question,
      answer: item.answer,
      keywords,
      category,
      confidence: 1.0
    };
  }

  // 키워드 추출 (단순 버전)
  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['은', '는', '이', '가', '을', '를', '에', '에서', '와', '과', '의', '도', '만', '부터', '까지', '으로', '로', '한다', '하다', '이다', '있다', '없다', '것', '수', '때', '곳', '분', '년', '월', '일']);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word))
      .slice(0, 10); // 상위 10개 키워드만
  }

  // 질문 카테고리 분류
  private categorizeQuestion(question: string): string {
    const categoryKeywords = {
      'group': ['그룹', '참여', '가입', '멤버', '팀'],
      'quest': ['퀘스트', '미션', '목표', '달성', '완료'],
      'stats': ['통계', '기록', '수치', '진행', '점수'],
      'help': ['도움', '방법', '어떻게', '사용법', '가이드'],
      'technical': ['오류', '버그', '문제', '안됨', '작동'],
      'channel': ['채널', '클럽', '방', '채팅']
    };

    const questionLower = question.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => questionLower.includes(keyword))) {
        return category;
      }
    }
    
    return 'general';
  }

  // 키워드 인덱스 구축 (검색 성능 향상)
  private buildKeywordIndex(): void {
    this.keywordIndex.clear();
    
    this.knowledgeBase.forEach(item => {
      item.keywords.forEach(keyword => {
        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, []);
        }
        this.keywordIndex.get(keyword)!.push(item);
      });
    });
  }

  // Q&A 검색 (다중 전략)
  searchQA(query: string, limit: number = 5): QASearchResult[] {
    if (!this.initialized || this.knowledgeBase.length === 0) {
      return [];
    }

    const results: QASearchResult[] = [];
    
    // 1. 정확한 매칭
    const exactMatches = this.findExactMatches(query);
    results.push(...exactMatches);
    
    // 2. 키워드 매칭
    if (results.length < limit) {
      const keywordMatches = this.findKeywordMatches(query);
      results.push(...keywordMatches.filter(r => !results.some(existing => existing.item.id === r.item.id)));
    }
    
    // 3. 의미적 유사도 매칭 (단순 버전)
    if (results.length < limit) {
      const semanticMatches = this.findSemanticMatches(query);
      results.push(...semanticMatches.filter(r => !results.some(existing => existing.item.id === r.item.id)));
    }
    
    // 4. 퍼지 매칭 (오타 허용)
    if (results.length < limit) {
      const fuzzyMatches = this.findFuzzyMatches(query);
      results.push(...fuzzyMatches.filter(r => !results.some(existing => existing.item.id === r.item.id)));
    }
    
    // 점수순 정렬 및 제한
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // 정확한 매칭
  private findExactMatches(query: string): QASearchResult[] {
    const queryLower = query.toLowerCase().trim();
    
    return this.knowledgeBase
      .filter(item => 
        item.question.toLowerCase().includes(queryLower) ||
        queryLower.includes(item.question.toLowerCase())
      )
      .map(item => ({
        item,
        score: 1.0,
        matchType: 'exact' as const
      }));
  }

  // 키워드 매칭
  private findKeywordMatches(query: string): QASearchResult[] {
    const queryKeywords = this.extractKeywords(query);
    const matches: Map<string, { item: QAItem; matchCount: number }> = new Map();
    
    queryKeywords.forEach(keyword => {
      const items = this.keywordIndex.get(keyword) || [];
      items.forEach(item => {
        const existing = matches.get(item.id);
        if (existing) {
          existing.matchCount++;
        } else {
          matches.set(item.id, { item, matchCount: 1 });
        }
      });
    });
    
    return Array.from(matches.values())
      .map(({ item, matchCount }) => ({
        item,
        score: Math.min(matchCount / queryKeywords.length, 1.0) * 0.8,
        matchType: 'keyword' as const
      }))
      .filter(result => result.score > 0.2);
  }

  // 의미적 유사도 매칭 (단순 버전)
  private findSemanticMatches(query: string): QASearchResult[] {
    const queryWords = new Set(this.extractKeywords(query));
    
    return this.knowledgeBase
      .map(item => {
        const itemWords = new Set(item.keywords);
        const intersection = new Set([...queryWords].filter(word => itemWords.has(word)));
        const union = new Set([...queryWords, ...itemWords]);
        
        const similarity = intersection.size / union.size;
        
        return {
          item,
          score: similarity * 0.6,
          matchType: 'semantic' as const
        };
      })
      .filter(result => result.score > 0.1);
  }

  // 퍼지 매칭 (오타 허용)
  private findFuzzyMatches(query: string): QASearchResult[] {
    const queryLower = query.toLowerCase();
    
    return this.knowledgeBase
      .map(item => {
        const similarity = this.calculateStringSimilarity(queryLower, item.question.toLowerCase());
        
        return {
          item,
          score: similarity * 0.4,
          matchType: 'fuzzy' as const
        };
      })
      .filter(result => result.score > 0.2);
  }

  // 문자열 유사도 계산 (Jaccard Index)
  private calculateStringSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    
    const intersection = new Set([...set1].filter(char => set2.has(char)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  // 카테고리별 Q&A 가져오기
  getQAByCategory(category: string): QAItem[] {
    return this.knowledgeBase.filter(item => item.category === category);
  }

  // 통계 정보
  getStats() {
    const categoryCounts: { [key: string]: number } = {};
    this.knowledgeBase.forEach(item => {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });

    return {
      totalItems: this.knowledgeBase.length,
      categories: categoryCounts,
      keywordIndexSize: this.keywordIndex.size,
      initialized: this.initialized
    };
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // Q&A 추가 (동적 학습)
  addQA(question: string, answer: string): void {
    const newItem = this.preprocessQAItem({ question, answer });
    this.knowledgeBase.push(newItem);
    
    // 키워드 인덱스 업데이트
    newItem.keywords.forEach(keyword => {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, []);
      }
      this.keywordIndex.get(keyword)!.push(newItem);
    });
    
    console.log('New Q&A added:', { question: question.substring(0, 50), category: newItem.category });
  }

  // 초기화 상태 확인
  isInitialized(): boolean {
    return this.initialized;
  }

  // 전체 지식 베이스 가져오기 (관리용)
  getAllQA(): QAItem[] {
    return [...this.knowledgeBase];
  }

  // Q&A 삭제
  removeQA(id: string): boolean {
    const index = this.knowledgeBase.findIndex(item => item.id === id);
    if (index !== -1) {
      const removedItem = this.knowledgeBase.splice(index, 1)[0];
      this.buildKeywordIndex(); // 인덱스 재구축
      console.log('Q&A removed:', removedItem.question);
      return true;
    }
    return false;
  }

  // 지식 베이스 초기화
  clearKnowledgeBase(): void {
    this.knowledgeBase = [];
    this.keywordIndex.clear();
    this.initialized = false;
    console.log('Knowledge base cleared');
  }
}