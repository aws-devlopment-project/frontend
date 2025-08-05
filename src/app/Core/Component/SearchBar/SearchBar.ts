// SearchBar.ts
import { Component, output, signal, computed, ElementRef, HostListener, ViewChild, OnInit } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { CommonModule } from "@angular/common";
import { SearchService } from "../../Service/SearchService";
import { DebugService } from "../../../Debug/DebugService";

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  type: 'group' | 'club';
  icon?: string;
  groupName?: string;
}

@Component({
    selector: 'app-header-searchBar',
    templateUrl: './SearchBar.html',
    styleUrl: './SearchBar.css',
    imports: [MatIconModule, CommonModule],
    standalone: true
})
export class SearchBarComponent implements OnInit {
    @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
    
    // 출력 이벤트
    searchQuery = output<string>();
    searchResultSelected = output<SearchResult>();
    groupSelected = output<string>();
    channelSelected = output<{ groupName: string, channelName: string }>();

    // 검색 관련 상태
    searchValue = signal<string>('');
    searchResults = signal<SearchResult[]>([]);
    showSearchDropdown = signal<boolean>(false);
    isSearching = signal<boolean>(false);
    selectedResultIndex = signal<number>(-1);
    isFocused = signal<boolean>(false);

    // 디바운스를 위한 타이머
    private searchTimeout: any = null;

    // 검색 결과가 있는지 확인하는 computed
    hasSearchResults = computed(() => this.searchResults().length > 0);
    
    // 드롭다운을 보여줄지 결정하는 computed
    shouldShowDropdown = computed(() => 
        this.isFocused() && 
        (this.isSearching() || this.hasSearchResults() || 
         (this.searchValue().trim().length > 0 && !this.isSearching() && !this.hasSearchResults()))
    );

    constructor(private elementRef: ElementRef, private searchService: SearchService, private debugService: DebugService) {}

    ngOnInit(): void {
        // 컴포넌트 초기화 시 SearchService 데이터 새로고침
        this.searchService.refreshData();
    }

    onSearchInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        const query = target.value;
        
        this.searchValue.set(query);
        this.searchQuery.emit(query); // 문자열로 emit
        
        // 기존 타이머 클리어
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        if (query.trim()) {
            // 디바운스 적용 (300ms 후 검색)
            this.searchTimeout = setTimeout(() => {
                this.performSearch(query);
            }, 300);
        } else {
            this.clearSearchResults();
        }
    }

    onSearchFocus(): void {
        this.isFocused.set(true);
        // 포커스 시 기존 검색어가 있으면 다시 검색
        const currentValue = this.searchValue().trim();
        if (currentValue && !this.hasSearchResults()) {
            this.performSearch(currentValue);
        }
    }

    onSearchBlur(): void {
        // 약간의 지연을 두어 클릭 이벤트가 처리될 수 있도록 함
        setTimeout(() => {
            this.isFocused.set(false);
            this.clearSearchResults();
        }, 200);
    }

    onSearchKeydown(event: KeyboardEvent): void {
        const results = this.searchResults();
        const currentIndex = this.selectedResultIndex();

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (results.length > 0) {
                    const nextIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0;
                    this.selectedResultIndex.set(nextIndex);
                }
                break;

            case 'ArrowUp':
                event.preventDefault();
                if (results.length > 0) {
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1;
                    this.selectedResultIndex.set(prevIndex);
                }
                break;

            case 'Enter':
                event.preventDefault();
                if (currentIndex >= 0 && results[currentIndex]) {
                    this.selectSearchResult(results[currentIndex], currentIndex);
                } else if (this.searchValue().trim()) {
                    // 선택된 결과가 없으면 검색어 자체를 emit
                    this.searchQuery.emit(this.searchValue());
                    this.clearSearchResults();
                }
                break;

            case 'Escape':
                event.preventDefault();
                this.clearSearchResults();
                this.searchInput.nativeElement.blur();
                break;
        }
    }

    async performSearch(query: string): Promise<void> {
        if (!query.trim()) {
            this.clearSearchResults();
            return;
        }

        this.isSearching.set(true);
        this.selectedResultIndex.set(-1);
        
        try {
            const results = await this.searchService.searchChannel(query);
            
            // 결과가 유효한지 확인하고 고유한 ID가 있는지 체크
            const validResults = results.filter(result => 
                result && result.id && result.title
            );

            // ID 중복 체크 및 고유성 보장
            const uniqueResults = this.ensureUniqueIds(validResults);
            
            this.searchResults.set(uniqueResults);
            this.debugService.printConsole('Search results:', uniqueResults);
        } catch (error) {
            this.debugService.printConsole('Search error:', error);
            this.searchResults.set([]);
        } finally {
            this.isSearching.set(false);
        }
    }

    private ensureUniqueIds(results: SearchResult[]): SearchResult[] {
        const seenIds = new Set<string>();
        const uniqueResults: SearchResult[] = [];

        results.forEach((result, index) => {
            let uniqueId = result.id;
            
            // ID가 중복되면 인덱스를 추가하여 고유하게 만듦
            if (seenIds.has(uniqueId)) {
                uniqueId = `${result.id}_${index}_${Date.now()}`;
            }
            
            seenIds.add(uniqueId);
            uniqueResults.push({
                ...result,
                id: uniqueId
            });
        });

        return uniqueResults;
    }

    clearSearchResults(): void {
        this.searchResults.set([]);
        this.isSearching.set(false);
        this.selectedResultIndex.set(-1);
        
        // 타이머도 클리어
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }
    }

    selectSearchResult(result: SearchResult, index?: number): void {
        if (index !== undefined) {
            this.selectedResultIndex.set(index);
        }
        
        this.searchValue.set(result.title);
        this.searchResultSelected.emit(result);
        
        // 결과 타입에 따라 적절한 이벤트 발생
        if (result.type === 'group') {
            this.groupSelected.emit(result.title);
        } else if (result.type === 'club' && result.groupName) {
            this.channelSelected.emit({
                groupName: result.groupName,
                channelName: result.title
            });
        }
        
        this.clearSearchResults();
        this.searchInput.nativeElement.blur();
        
        this.debugService.printConsole('Selected search result:', result);
    }

    getResultIcon(result: SearchResult): string {
        return result.icon || this.getDefaultIcon(result.type);
    }

    private getDefaultIcon(type: SearchResult['type']): string {
        const iconMap = {
            'group': 'group',
            'club': 'tag'
        };
        return iconMap[type] || 'search';
    }

    // 컴포넌트 외부 클릭 시 드롭다운 닫기
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: Event): void {
        if (!this.elementRef.nativeElement.contains(event.target as Node)) {
            this.isFocused.set(false);
            this.clearSearchResults();
        }
    }

    // 키보드 단축키 처리 (Cmd+K 또는 Ctrl+K)
    @HostListener('document:keydown', ['$event'])
    onGlobalKeydown(event: KeyboardEvent): void {
        if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
            event.preventDefault();
            this.searchInput.nativeElement.focus();
        }
    }

    // 타입별 라벨 반환
    getTypeLabel(type: SearchResult['type']): string {
        const labelMap = {
            'group': '그룹',
            'club': '채널'
        };
        return labelMap[type] || type;
    }

    // 컴포넌트 종료 시 정리
    ngOnDestroy(): void {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
    }
}