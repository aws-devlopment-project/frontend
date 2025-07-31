import { Component } from "@angular/core";
import { MatIcon, MatIconModule } from "@angular/material/icon";

@Component({
    selector: 'app-header-searchBar',
    templateUrl: './SearchBar.html',
    styleUrl: './SearchBar.css',
    imports: [MatIconModule],
    standalone: true
})
export class SearchBarComponent {
    constructor() {}
}