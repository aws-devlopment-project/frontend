import { Injectable } from "@angular/core";

@Injectable({
    providedIn: 'root'
})
export class DataCacheService{
    private cache = new Map<string, { data: any, timestamp: number}>();
    private readonly CACHE_DURATION = 60 * 1000 * 45;
    
    constructor() {}

    setCache(key: string, data: any, ttl: number = this.CACHE_DURATION): void {
        if (key === undefined || data === undefined)
            return ;
        this.removeCache(key);
        const item = {
            data,
            expiary: Date.now() + ttl
        };
        if (key === 'user' || key === 'userStatus') {
            sessionStorage.setItem(`${key}`, JSON.stringify(item));
        } else {
            localStorage.setItem(`${key}`, JSON.stringify(item));
        }
    }

    getCache(key: string): any {
        let item;
        if (key === 'user' || key === 'userStatus') {
            item = sessionStorage.getItem(`${key}`);
        } else {
            item = localStorage.getItem(`${key}`);
        }

        if (!item)
            return null;
        const parsedItem = JSON.parse(item);
        if (Date.now() > parsedItem.expiary) {
            if (key === 'user') {
                sessionStorage.removeItem(`${key}`);
            } else {
                localStorage.removeItem(`${key}`);
            }
            return null;
        }
        return parsedItem.data;
    }

    removeCache(key: string): void {
        if (key === 'user' || key === 'userStatus') {
            sessionStorage.removeItem(`${key}`);
        } else {
            localStorage.removeItem(`${key}`);
        }
    }
}