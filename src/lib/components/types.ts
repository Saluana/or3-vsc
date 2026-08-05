export type Or3ScrollItemKey = string | number;

/** A stable point within a rendered item, suitable for restoring a viewport. */
export interface Or3ScrollAnchorPoint {
    key: Or3ScrollItemKey;
    withinItem: number;
    /** Original item index used when a key is no longer present. */
    index: number;
}

/**
 * Lightweight public viewport state. It intentionally stores keys and offsets,
 * never DOM nodes or the virtualizer's internal measurement cache.
 */
export interface Or3ScrollViewState {
    version: 1;
    contentKey?: Or3ScrollItemKey;
    mode: 'bottom' | 'anchor';
    anchors?: Or3ScrollAnchorPoint[];
    scrollTop: number;
}

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
