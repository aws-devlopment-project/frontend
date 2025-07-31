import { Component } from "@angular/core";
import { SearchBarComponent } from "../SearchBar/SearchBar";

@Component({
    selector: 'app-header',
    templateUrl: './HeaderBar.html',
    styleUrl: './HeaderBar.css',
    imports: [SearchBarComponent],
    standalone: true
})
export class HeaderBarComponent {

}