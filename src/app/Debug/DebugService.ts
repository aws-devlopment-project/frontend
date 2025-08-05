import { Injectable } from "@angular/core";
import { environment } from "../../environments/environment.prod";

@Injectable({
    providedIn: 'root'
})
export class DebugService {
    printConsole(...value: any) {
        if (!environment.production)
            console.log(...value);
    }
}