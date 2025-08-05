import { Injectable } from "@angular/core";

export interface CacheItem<T = any> {
    data: T;
    timestamp: number;
    expiry: number;
    version?: string;
}

export interface CacheStats {
    totalItems: number;
    sessionItems: number;
    localItems: number;
    expiredItems: number;
    totalSize: number;
}

@Injectable({
    providedIn: 'root'
})
export class DataCacheService {
    private readonly DEFAULT_TTL = 60 * 1000 * 45; // 45분
    private readonly CACHE_VERSION = '1.0.0';
    
    // 세션 스토리지를 사용할 키들
    private readonly SESSION_KEYS = ['user', 'userStatus', 'userCredentials'];
    
    // 캐시 크기 제한 (MB)
    private readonly MAX_CACHE_SIZE = 10; // 10MB
    
    constructor() {
        this.initializeCache();
    }

    private initializeCache(): void {
        // 앱 시작 시 만료된 캐시 정리
        this.cleanupExpiredCache();
        
        // 주기적으로 캐시 정리 (5분마다)
        setInterval(() => {
            this.cleanupExpiredCache();
        }, 5 * 60 * 1000);
    }

    /**
     * 캐시에 데이터 저장
     */
    setCache<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): boolean {
        try {
            if (!this.isValidKey(key) || data === undefined || data === null) {
                console.warn('Invalid cache parameters:', { key, data, ttl });
                return false;
            }

            // 기존 캐시 제거
            this.removeCache(key);

            const item: CacheItem<T> = {
                data,
                timestamp: Date.now(),
                expiry: Date.now() + ttl,
                version: this.CACHE_VERSION
            };

            const serializedItem = JSON.stringify(item);
            
            // 크기 체크
            if (!this.checkCacheSize(serializedItem)) {
                console.warn('Cache size limit exceeded for key:', key);
                return false;
            }

            const storage = this.getStorage(key);
            storage.setItem(this.getCacheKey(key), serializedItem);
            
            console.debug(`Cache set: ${key} (TTL: ${ttl}ms)`);
            return true;

        } catch (error) {
            console.error('Error setting cache:', error, { key, ttl });
            return false;
        }
    }

    /**
     * 캐시에서 데이터 조회
     */
    getCache<T>(key: string): T | null {
        try {
            if (!this.isValidKey(key)) {
                return null;
            }

            const storage = this.getStorage(key);
            const item = storage.getItem(this.getCacheKey(key));

            if (!item) {
                return null;
            }

            const parsedItem: CacheItem<T> = JSON.parse(item);

            // 버전 체크
            if (parsedItem.version !== this.CACHE_VERSION) {
                console.debug(`Cache version mismatch for ${key}, removing`);
                this.removeCache(key);
                return null;
            }

            // 만료 체크
            if (Date.now() > parsedItem.expiry) {
                console.debug(`Cache expired for ${key}, removing`);
                this.removeCache(key);
                return null;
            }

            console.debug(`Cache hit: ${key}`);
            return parsedItem.data;

        } catch (error) {
            console.error('Error getting cache:', error, { key });
            // 손상된 캐시 제거
            this.removeCache(key);
            return null;
        }
    }

    /**
     * 캐시 제거
     */
    removeCache(key: string): boolean {
        try {
            if (!this.isValidKey(key)) {
                return false;
            }

            const storage = this.getStorage(key);
            const cacheKey = this.getCacheKey(key);
            
            if (storage.getItem(cacheKey)) {
                storage.removeItem(cacheKey);
                console.debug(`Cache removed: ${key}`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error removing cache:', error, { key });
            return false;
        }
    }

    /**
     * 캐시 존재 여부 확인
     */
    hasCache(key: string): boolean {
        try {
            if (!this.isValidKey(key)) {
                return false;
            }

            const storage = this.getStorage(key);
            const item = storage.getItem(this.getCacheKey(key));
            
            if (!item) {
                return false;
            }

            const parsedItem: CacheItem = JSON.parse(item);
            
            // 버전 및 만료 체크
            if (parsedItem.version !== this.CACHE_VERSION || Date.now() > parsedItem.expiry) {
                this.removeCache(key);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error checking cache:', error, { key });
            this.removeCache(key);
            return false;
        }
    }

    /**
     * 캐시 만료 시간 조회
     */
    getCacheExpiry(key: string): number | null {
        try {
            if (!this.isValidKey(key)) {
                return null;
            }

            const storage = this.getStorage(key);
            const item = storage.getItem(this.getCacheKey(key));
            
            if (!item) {
                return null;
            }

            const parsedItem: CacheItem = JSON.parse(item);
            return parsedItem.expiry;
        } catch (error) {
            console.error('Error getting cache expiry:', error, { key });
            return null;
        }
    }

    /**
     * 캐시 TTL 연장
     */
    extendCacheTTL(key: string, additionalTTL: number): boolean {
        try {
            const storage = this.getStorage(key);
            const item = storage.getItem(this.getCacheKey(key));
            
            if (!item) {
                return false;
            }

            const parsedItem: CacheItem = JSON.parse(item);
            
            // 이미 만료된 경우 연장하지 않음
            if (Date.now() > parsedItem.expiry) {
                this.removeCache(key);
                return false;
            }

            parsedItem.expiry = Date.now() + additionalTTL;
            storage.setItem(this.getCacheKey(key), JSON.stringify(parsedItem));
            
            console.debug(`Cache TTL extended: ${key} (+${additionalTTL}ms)`);
            return true;
        } catch (error) {
            console.error('Error extending cache TTL:', error, { key, additionalTTL });
            return false;
        }
    }

    /**
     * 모든 캐시 삭제
     */
    clearAllCache(): void {
        try {
            const sessionKeys = this.getAllCacheKeys(sessionStorage);
            const localKeys = this.getAllCacheKeys(localStorage);
            
            [...sessionKeys, ...localKeys].forEach(key => {
                this.removeCache(key);
            });
            
            console.debug('All cache cleared');
        } catch (error) {
            console.error('Error clearing all cache:', error);
        }
    }

    /**
     * 특정 패턴의 캐시 삭제
     */
    clearCacheByPattern(pattern: string): number {
        try {
            let removedCount = 0;
            const regex = new RegExp(pattern);
            
            const sessionKeys = this.getAllCacheKeys(sessionStorage);
            const localKeys = this.getAllCacheKeys(localStorage);
            
            [...sessionKeys, ...localKeys].forEach(key => {
                if (regex.test(key)) {
                    if (this.removeCache(key)) {
                        removedCount++;
                    }
                }
            });
            
            console.debug(`Cache cleared by pattern: ${pattern} (${removedCount} items)`);
            return removedCount;
        } catch (error) {
            console.error('Error clearing cache by pattern:', error, { pattern });
            return 0;
        }
    }

    /**
     * 만료된 캐시 정리
     */
    cleanupExpiredCache(): number {
        try {
            let cleanedCount = 0;
            
            const sessionKeys = this.getAllCacheKeys(sessionStorage);
            const localKeys = this.getAllCacheKeys(localStorage);
            
            [...sessionKeys, ...localKeys].forEach(key => {
                if (!this.hasCache(key)) {
                    cleanedCount++;
                }
            });
            
            if (cleanedCount > 0) {
                console.debug(`Expired cache cleaned: ${cleanedCount} items`);
            }
            
            return cleanedCount;
        } catch (error) {
            console.error('Error cleaning expired cache:', error);
            return 0;
        }
    }

    /**
     * 캐시 통계 조회
     */
    getCacheStats(): CacheStats {
        try {
            const sessionKeys = this.getAllCacheKeys(sessionStorage);
            const localKeys = this.getAllCacheKeys(localStorage);
            
            let totalSize = 0;
            let expiredItems = 0;
            
            [...sessionKeys, ...localKeys].forEach(key => {
                const storage = this.getStorage(key);
                const item = storage.getItem(this.getCacheKey(key));
                
                if (item) {
                    totalSize += new Blob([item]).size;
                    try {
                        const parsedItem: CacheItem = JSON.parse(item);
                        if (Date.now() > parsedItem.expiry) {
                            expiredItems++;
                        }
                    } catch {
                        expiredItems++;
                    }
                }
            });
            
            return {
                totalItems: sessionKeys.length + localKeys.length,
                sessionItems: sessionKeys.length,
                localItems: localKeys.length,
                expiredItems,
                totalSize: Math.round(totalSize / 1024) // KB 단위
            };
        } catch (error) {
            console.error('Error getting cache stats:', error);
            return {
                totalItems: 0,
                sessionItems: 0,
                localItems: 0,
                expiredItems: 0,
                totalSize: 0
            };
        }
    }

    // === Private Helper Methods ===

    private isValidKey(key: string): boolean {
        return typeof key === 'string' && key.trim().length > 0;
    }

    private getStorage(key: string): Storage {
        return this.SESSION_KEYS.includes(key) ? sessionStorage : localStorage;
    }

    private getCacheKey(key: string): string {
        return `app_cache_${key}`;
    }

    private getAllCacheKeys(storage: Storage): string[] {
        const keys: string[] = [];
        const prefix = 'app_cache_';
        
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key && key.startsWith(prefix)) {
                keys.push(key.substring(prefix.length));
            }
        }
        
        return keys;
    }

    private checkCacheSize(serializedItem: string): boolean {
        try {
            const itemSize = new Blob([serializedItem]).size;
            const maxSizeBytes = this.MAX_CACHE_SIZE * 1024 * 1024; // MB를 bytes로 변환
            
            if (itemSize > maxSizeBytes) {
                console.warn(`Item size (${Math.round(itemSize / 1024)}KB) exceeds limit`);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Error checking cache size:', error);
            return false;
        }
    }

    // === 디버깅 메서드들 ===

    /**
     * 캐시 상태 로그 출력 (개발용)
     */
    logCacheStatus(): void {
        console.group('=== Cache Status ===');
        
        const stats = this.getCacheStats();
        console.log('Stats:', stats);
        
        const sessionKeys = this.getAllCacheKeys(sessionStorage);
        const localKeys = this.getAllCacheKeys(localStorage);
        
        console.log('Session Storage Keys:', sessionKeys);
        console.log('Local Storage Keys:', localKeys);
        
        console.groupEnd();
    }

    /**
     * 특정 캐시 항목 상세 정보 출력 (개발용)
     */
    logCacheItem(key: string): void {
        try {
            const storage = this.getStorage(key);
            const item = storage.getItem(this.getCacheKey(key));
            
            if (!item) {
                console.log(`Cache item not found: ${key}`);
                return;
            }
            
            const parsedItem: CacheItem = JSON.parse(item);
            const now = Date.now();
            const isExpired = now > parsedItem.expiry;
            const timeLeft = Math.max(0, parsedItem.expiry - now);
            
            console.group(`=== Cache Item: ${key} ===`);
            console.log('Data:', parsedItem.data);
            console.log('Created:', new Date(parsedItem.timestamp).toLocaleString());
            console.log('Expires:', new Date(parsedItem.expiry).toLocaleString());
            console.log('Time Left:', isExpired ? 'EXPIRED' : `${Math.round(timeLeft / 1000)}s`);
            console.log('Version:', parsedItem.version);
            console.log('Size:', `${Math.round(new Blob([item]).size / 1024)}KB`);
            console.groupEnd();
        } catch (error) {
            console.error('Error logging cache item:', error, { key });
        }
    }
}