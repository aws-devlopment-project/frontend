// SearchBar.ts
import { Component, signal, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

@Component({
    selector: 'app-header-searchBar',
    templateUrl: './SearchBar.html',
    styleUrl: './SearchBar.css',
    imports: [MatIconModule],
    standalone: true
})
export class SearchBarComponent {
    searchValue = signal('');
    isSearchFocused = signal(false);
    
    // 출력 이벤트
    searchQuery = output<string>();

    constructor() {
        // 키보드 단축키 등록 (Ctrl+K 또는 Cmd+K)
        this.registerKeyboardShortcuts();
    }

    onSearchInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.searchValue.set(target.value);
        this.searchQuery.emit(target.value);
        this.performSearch(target.value);
    }

    onSearchFocus(): void {
        this.isSearchFocused.set(true);
    }

    onSearchBlur(): void {
        this.isSearchFocused.set(false);
    }

    private performSearch(query: string): void {
        if (query.trim()) {
            console.log('Searching for:', query);
            // 실제 검색 API 호출
        }
    }

    private registerKeyboardShortcuts(): void {
        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                // 검색창에 포커스
                const searchInput = document.querySelector('.search-bar-input') as HTMLInputElement;
                searchInput?.focus();
            }
        });
    }
}