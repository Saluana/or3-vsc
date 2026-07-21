import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useScrollJump, type Or3ScrollRef } from '../useScrollJump';

type Item = { id: string | number };

const deferred = () => {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('useScrollJump', () => {
    it('preserves numeric keys and requested alignment', async () => {
        const scrollToItemKey = vi.fn();
        const items = ref<Item[]>([{ id: 42 }]);
        const { jumpTo, jumpState } = useScrollJump({
            scrollerRef: ref<Or3ScrollRef>({ scrollToItemKey }),
            items,
            getItemId: (item) => item.id,
            loadHistoryUntil: vi.fn(),
        });

        await jumpTo(42, { align: 'end' });

        expect(scrollToItemKey).toHaveBeenCalledWith(42, { align: 'end' });
        expect(jumpState.value).toEqual({ state: 'idle' });
    });

    it('lets a newer request supersede stale history work', async () => {
        const first = deferred();
        const second = deferred();
        const scrollToItemKey = vi.fn();
        const items = ref<Item[]>([]);
        const loadHistoryUntil = vi
            .fn()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        const { jumpTo } = useScrollJump({
            scrollerRef: ref<Or3ScrollRef>({ scrollToItemKey }),
            items,
            getItemId: (item) => item.id,
            loadHistoryUntil,
        });

        const staleJump = jumpTo('old');
        const activeJump = jumpTo('new', { align: 'start' });
        items.value = [{ id: 'new' }];
        await nextTick();
        await nextTick();
        await Promise.all([staleJump, activeJump]);

        expect(scrollToItemKey).toHaveBeenCalledTimes(1);
        expect(scrollToItemKey).toHaveBeenCalledWith('new', { align: 'start' });
    });

    it('jumps when an item arrives even if history loading remains unresolved', async () => {
        const history = deferred();
        const scrollToItemKey = vi.fn();
        const items = ref<Item[]>([]);
        const { jumpTo, jumpState } = useScrollJump({
            scrollerRef: ref<Or3ScrollRef>({ scrollToItemKey }),
            items,
            getItemId: (item) => item.id,
            loadHistoryUntil: () => history.promise,
        });

        const jump = jumpTo(7, { align: 'center' });
        items.value = [{ id: 7 }];
        await nextTick();
        await nextTick();
        await jump;

        expect(scrollToItemKey).toHaveBeenCalledWith(7, { align: 'center' });
        expect(jumpState.value).toEqual({ state: 'idle' });
    });

    it('observes a target added by an in-place array mutation', async () => {
        const history = deferred();
        const scrollToItemKey = vi.fn();
        const items = ref<Item[]>([]);
        const { jumpTo } = useScrollJump({
            scrollerRef: ref<Or3ScrollRef>({ scrollToItemKey }),
            items,
            getItemId: (item) => item.id,
            loadHistoryUntil: () => history.promise,
        });

        const jump = jumpTo('in-place', { align: 'start' });
        items.value.push({ id: 'in-place' });
        await nextTick();
        await nextTick();
        await jump;

        expect(scrollToItemKey).toHaveBeenCalledWith('in-place', {
            align: 'start',
        });
    });

    it('returns to idle when completed history does not contain the target', async () => {
        const { jumpTo, jumpState } = useScrollJump({
            scrollerRef: ref<Or3ScrollRef | null>(null),
            items: ref<Item[]>([]),
            getItemId: (item) => item.id,
            loadHistoryUntil: async () => undefined,
        });

        await jumpTo('missing');
        expect(jumpState.value).toEqual({ state: 'idle' });
    });
});
