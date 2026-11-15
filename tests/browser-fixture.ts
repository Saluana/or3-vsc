import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import Or3Scroll from '../src/lib/components/Or3Scroll.vue';

const frame = () =>
    new Promise<void>((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0))
    );
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
};

Object.assign(window, {
    async __scrollRegression(aboveViewport: boolean) {
        const errors: string[] = [];
        const onError = (event: ErrorEvent) => errors.push(event.message);
        window.addEventListener('error', onError);
        const root = document.querySelector<HTMLElement>('#app')!;
        const api = ref<any>();
        const items = Array.from({ length: 60 }, (_, id) => ({
            id,
            height: id === 10 ? 2200 : 200
        }));
        const giantHeight = ref(2200);
        const Row = defineComponent({
            props: ['item'],
            setup: (props) => () =>
                h(
                    'div',
                    {
                        style: {
                            height: `${props.item.id === 10 ? giantHeight.value : props.item.height}px`
                        }
                    },
                    String(props.item.id)
                )
        });
        const app = createApp({
            render: () =>
                h(
                    Or3Scroll,
                    {
                        ref: api,
                        items,
                        itemKey: 'id',
                        estimateHeight: 200,
                        overscan: 200,
                        maintainBottom: false,
                        style: 'height:600px;width:500px'
                    },
                    { default: ({ item }: any) => h(Row, { item }) }
                )
        });
        const samples: unknown[] = [];
        try {
            app.mount(root);
            await nextTick();
            api.value.scrollToIndex(aboveViewport ? 11 : 10);
            await pause(250);
            const scroller = root.querySelector<HTMLElement>('.or3-scroll')!;
            const snapshot = () => {
                const viewport = scroller.getBoundingClientRect();
                const rows = [
                    ...scroller.querySelectorAll<HTMLElement>(
                        '.or3-scroll-item'
                    )
                ];
                const first = rows.find(
                    (row) =>
                        row.getBoundingClientRect().bottom > viewport.top + 1
                )!;
                return {
                    gap: Math.max(
                        0,
                        viewport.top +
                            scroller.clientHeight -
                            Math.max(
                                ...rows.map(
                                    (row) => row.getBoundingClientRect().bottom
                                )
                            )
                    ),
                    anchor: first.dataset.index,
                    offset: first.getBoundingClientRect().top - viewport.top,
                    mounted: rows.map((row) => row.dataset.index)
                };
            };
            const before = snapshot();
            for (let index = 0; index < 5; index++) {
                const giant = scroller.querySelector<HTMLElement>(
                    '[data-index="10"] > div'
                )!;
                check(
                    giant,
                    'the overscanned collapsing row must remain mounted'
                );
                giantHeight.value = 40;
                await nextTick();
                await frame();
                const collapsed = snapshot();
                samples.push(collapsed);
                check(
                    collapsed.gap <= 1,
                    `a collapsed row painted an empty ${collapsed.gap}px strip`
                );
                check(
                    collapsed.anchor === before.anchor &&
                        Math.abs(collapsed.offset - before.offset) <= 1,
                    `collapse must retain the visible anchor: ${JSON.stringify({ before, collapsed })}`
                );
                await frame();
                giantHeight.value = 2200;
                await nextTick();
                await frame();
                await frame();
            }
            check(
                !errors.some((error) => /ResizeObserver/i.test(error)),
                `observer delivery loop: ${errors.join('; ')}`
            );
            return { aboveViewport, samples, errors };
        } finally {
            app.unmount();
            window.removeEventListener('error', onError);
        }
    }
});
