import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium, webkit } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(
    process.env.SCROLL_EVIDENCE_DIR ||
        resolve(root, 'artifacts/browser-regressions')
);
await mkdir(output, { recursive: true });
const server = await createServer({
    configFile: false,
    root,
    plugins: [
        vue(),
        {
            name: 'regressions',
            configureServer(server) {
                server.middlewares.use(
                    '/__regressions',
                    (_request, response) => {
                        response.setHeader('Content-Type', 'text/html');
                        response.end(
                            '<!doctype html><html><body><div id="app"></div><script type="module" src="/tests/browser-fixture.ts"></script></body></html>'
                        );
                    }
                );
            }
        }
    ],
    server: { host: '127.0.0.1', port: 0 }
});
let browser;
const results = [];
try {
    await server.listen();
    browser = await (
        process.env.SCROLL_BROWSER === 'webkit' ? webkit : chromium
    ).launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(
        `http://127.0.0.1:${server.httpServer.address().port}/__regressions`
    );
    await page.waitForFunction(() => Boolean(window.__scrollRegression));
    for (const aboveViewport of [false, true]) {
        try {
            const evidence = await page.evaluate(
                (above) => window.__scrollRegression(above),
                aboveViewport
            );
            results.push({ aboveViewport, passed: true, evidence });
        } catch (error) {
            results.push({
                aboveViewport,
                passed: false,
                error: String(error)
            });
            await page.screenshot({
                path: resolve(output, `collapse-${aboveViewport}.png`)
            });
        }
    }
} finally {
    await browser?.close();
    await server.close();
    await writeFile(
        resolve(output, 'results.json'),
        JSON.stringify(results, null, 2) + '\n'
    );
}
console.log(JSON.stringify(results, null, 2));
assert(
    results.length === 2 && results.every((result) => result.passed),
    `Scroll regressions failed; see ${output}`
);
