import { Component } from "@angular/core";
import { HeaderBarComponent } from "../Core/Component/HeaderBar/HeaderBar";
import { SideBarComponent } from "../Core/Component/SideBar/SideBar";
import { MainContainerComponent } from "../Core/Component/MainContainer/MainContainer";

@Component({
    selector: 'app-home',
    templateUrl: './Home.html',
    styleUrl: './Home.css',
    imports: [HeaderBarComponent, SideBarComponent, MainContainerComponent],
    standalone: true
})
export class HomeComponent {

}