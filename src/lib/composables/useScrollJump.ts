import { nextTick, ref, watch, type Ref } from 'vue';

export type ScrollJumpAlignment = 'start' | 'center' | 'end';

export type JumpState =
    | { state: 'idle' }
    | {
          state: 'jumping';
          targetId: string | number;
          align: ScrollJumpAlignment;
      }
    | {
          state: 'waitingForHistory';
          targetId: string | number;
          direction: 'up' | 'down';
          align: ScrollJumpAlignment;
      };

export interface Or3ScrollRef {
    scrollToItemKey: (
        key: string | number,
        opts?: { align?: ScrollJumpAlignment; smooth?: boolean }
    ) => void;
}

export interface UseScrollJumpOptions<T> {
    scrollerRef: Ref<Or3ScrollRef | null>;
    items: Ref<T[]>;
    getItemId: (item: T) => string | number;
    loadHistoryUntil: (
        targetId: string | number,
        direction: 'up' | 'down'
    ) => Promise<void>;
}

/**
 * Coordinates keyed jumps with async history loading. A newer request always
 * supersedes older loading and post-render correction work.
 */
export function useScrollJump<T>(options: UseScrollJumpOptions<T>) {
    const { scrollerRef, items, getItemId, loadHistoryUntil } = options;
    const jumpState = ref<JumpState>({ state: 'idle' });
    let requestGeneration = 0;
    type WaitOutcome =
        | { kind: 'target' }
        | { kind: 'loaded' }
        | { kind: 'superseded' }
        | { kind: 'error'; error: unknown };
    let activeWait:
        | {
              generation: number;
              settle: (outcome: WaitOutcome) => void;
          }
        | undefined;

    const findIndex = (id: string | number) =>
        items.value.findIndex((item) => getItemId(item) === id);

    const completeJump = async (
        id: string | number,
        align: ScrollJumpAlignment,
        generation: number
    ) => {
        if (generation !== requestGeneration || findIndex(id) === -1) return false;
        jumpState.value = { state: 'jumping', targetId: id, align };
        await nextTick();
        if (generation !== requestGeneration || findIndex(id) === -1) return false;
        const scroller = scrollerRef.value;
        if (!scroller) return false;
        scroller.scrollToItemKey(id, { align });
        if (generation === requestGeneration) {
            jumpState.value = { state: 'idle' };
        }
        return true;
    };

    const jumpTo = async (
        id: string | number,
        opts: {
            align?: ScrollJumpAlignment;
            direction?: 'up' | 'down';
        } = {}
    ): Promise<void> => {
        const align = opts.align ?? 'center';
        const direction = opts.direction ?? 'up';
        activeWait?.settle({ kind: 'superseded' });
        const generation = ++requestGeneration;

        if (findIndex(id) !== -1) {
            if (!(await completeJump(id, align, generation))) {
                if (generation === requestGeneration) {
                    jumpState.value = { state: 'idle' };
                }
            }
            return;
        }

        jumpState.value = {
            state: 'waitingForHistory',
            targetId: id,
            direction,
            align,
        };

        let settle!: (outcome: WaitOutcome) => void;
        const arrivalOrCancellation = new Promise<WaitOutcome>((resolve) => {
            settle = resolve;
        });
        activeWait = { generation, settle };
        const history: Promise<WaitOutcome> = Promise.resolve()
            .then(() => loadHistoryUntil(id, direction))
            .then(
                (): WaitOutcome => ({ kind: 'loaded' }),
                (error: unknown): WaitOutcome => ({ kind: 'error', error })
            );
        const outcome = await Promise.race([history, arrivalOrCancellation]);
        if (activeWait?.generation === generation) activeWait = undefined;
        if (
            generation !== requestGeneration ||
            outcome.kind === 'superseded'
        ) {
            return;
        }
        if (outcome.kind === 'error') {
            console.error(
                '[useScrollJump] Failed to load history:',
                outcome.error
            );
            jumpState.value = { state: 'idle' };
            return;
        }

        await nextTick();
        if (await completeJump(id, align, generation)) return;
        if (generation === requestGeneration) jumpState.value = { state: 'idle' };
    };

    watch(
        () => {
            const state = jumpState.value;
            return state.state === 'waitingForHistory'
                ? findIndex(state.targetId)
                : -1;
        },
        (targetIndex) => {
            if (targetIndex === -1) return;
            const wait = activeWait;
            if (wait?.generation === requestGeneration) {
                wait.settle({ kind: 'target' });
            }
        },
        { flush: 'post' }
    );

    return { jumpTo, jumpState };
}
