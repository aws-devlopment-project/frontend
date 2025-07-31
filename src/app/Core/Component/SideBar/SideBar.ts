import { Component, signal } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { transition } from "@angular/animations";

@Component({
    selector: 'app-sidebar',
    templateUrl: './Sidebar.html',
    styleUrl: './SideBar.css',
    imports: [MatIconModule],
    standalone: true
})
export class SideBarComponent {
    isShown = signal(false);

    toggle() {
        this.isShown.update((isShown) => !isShown);
    }
}