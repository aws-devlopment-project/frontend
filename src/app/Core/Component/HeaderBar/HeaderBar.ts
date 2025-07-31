// HeaderBar.ts
import { Component, input, output } from "@angular/core";
import { SearchBarComponent } from "../SearchBar/SearchBar";
import { MatIconModule } from "@angular/material/icon";
import { CommonModule } from "@angular/common";

@Component({
    selector: 'app-header',
    templateUrl: './HeaderBar.html',
    styleUrl: './HeaderBar.css',
    imports: [SearchBarComponent, MatIconModule, CommonModule],
    standalone: true
})
export class HeaderBarComponent {
    // 입력 프로퍼티
    showSearch = input<boolean>(true);
    
    // 출력 이벤트
    searchQuery = output<string>();
    notificationClick = output<void>();
    helpClick = output<void>();
    profileClick = output<void>();

    onSearchQuery(query: string): void {
        this.searchQuery.emit(query);
    }

    onNotificationClick(): void {
        this.notificationClick.emit();
    }

    onHelpClick(): void {
        this.helpClick.emit();
    }

    onProfileClick(): void {
        this.profileClick.emit();
    }
}