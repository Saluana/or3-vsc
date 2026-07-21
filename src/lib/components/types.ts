export type Or3ScrollItemKey = string | number;

export interface Or3ScrollProps<T> {
    items: T[];
    estimateHeight?: number;
    overscan?: number;
    prefetchOverscan?: number;
    itemKey: keyof T | ((item: T) => Or3ScrollItemKey);
    maintainBottom?: boolean;
    loadingHistory?: boolean;
    tailCount?: number;
    paddingBottom?: number;
    paddingTop?: number;
    bottomThreshold?: number;
    autoscrollThreshold?: number;
    mutationMode?: 'append-prepend' | 'arbitrary';
    contentKey?: Or3ScrollItemKey;
}

export interface Or3ScrollPrefetchRange {
    startIndex: number;
    endIndex: number;
}
