import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8')
) as {
    version: string;
    exports: Record<string, unknown>;
};

describe('published package surface', () => {
    it('keeps the supported entrypoints and stylesheet export', () => {
        expect(packageJson.exports).toEqual({
            '.': {
                import: './dist/or3-scroll.js',
                require: './dist/or3-scroll.umd.cjs',
                types: './dist/index.d.ts',
            },
            './style.css': './dist/style.css',
        });
        expect(readFileSync(resolve(root, 'README.md'), 'utf8')).toContain(
            "import 'or3-scroll/style.css'"
        );
    });

    it('snapshots all public declaration names and component APIs', () => {
        const declarations = readFileSync(
            resolve(root, 'dist/index.d.ts'),
            'utf8'
        );
        const names = Array.from(
            declarations.matchAll(
                /^export declare (?:class|const|function|interface|type) (\w+)/gm
            ),
            (match) => match[1]
        ).sort();

        expect(names).toMatchInlineSnapshot(`
          [
            "Index",
            "JumpState",
            "Or3Scroll",
            "Or3ScrollItemKey",
            "Or3ScrollPrefetchRange",
            "Or3ScrollProps",
            "Or3ScrollRef",
            "RangeResult",
            "ScrollJumpAlignment",
            "UseScrollJumpOptions",
            "VirtualizerConfig",
            "VirtualizerEngine",
            "useScrollJump",
          ]
        `);
        for (const api of [
            'scrollToBottom',
            'scrollToIndex',
            'scrollToItemKey',
            'refreshMeasurements',
            'reset',
            'prefetchOverscan',
            'mutationMode',
            'contentKey',
            'onPrefetchRange',
        ]) {
            expect(declarations).toContain(api);
        }
    });

    it('loads the built package through both ESM and CommonJS entries', async () => {
        const esmPath = resolve(root, 'dist/or3-scroll.js');
        const esm = await import(
            `${pathToFileURL(esmPath).href}?version=${packageJson.version}`
        );
        const require = createRequire(import.meta.url);
        const cjs = require(resolve(root, 'dist/or3-scroll.umd.cjs')) as Record<
            string,
            unknown
        >;

        for (const entry of [esm, cjs]) {
            expect(entry).toHaveProperty('Or3Scroll');
            expect(entry).toHaveProperty('VirtualizerEngine');
            expect(entry).toHaveProperty('useScrollJump');
        }
    });
});
