import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: false,
    workers: 1,
    timeout: 45000,
    expect: { timeout: 12000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    globalSetup: './tests/setup.mjs',
    use: { baseURL: 'http://127.0.0.1:5097', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' }
});
