import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const [baseUrl, credentialPath] = process.argv.slice(2);
if (!baseUrl || !credentialPath || new URL(baseUrl).protocol !== 'http:') {
    throw new Error('Usage: node tools/verify-iis.mjs http://IP:PORT path-to-private-admin-credentials.json');
}
const credentials = JSON.parse((await readFile(credentialPath, 'utf8')).replace(/^\uFEFF/, ''));
let browser;
try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: baseUrl });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const anonymous = await context.request.get('/api/documents');
    expect(anonymous.status()).toBe(401);
    await page.goto('/Login');
    await expect(page.getByRole('heading', { name: 'Masuk ke arsip' })).toBeVisible();
    await page.getByLabel('Nama pengguna', { exact: true }).fill(credentials.username);
    await page.getByLabel('Password', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dokumen bersama', exact: true })).toBeVisible();
    let result;
    await expect.poll(async () => {
        const response = await page.request.get('/api/documents');
        expect(response.status()).toBe(200);
        result = await response.json();
        return result.import.state;
    }).toBe('ready');
    for (const path of ['/css/site.css', '/js/documents.js', '/vendor/pdfjs/pdf.mjs', '/vendor/pdfjs/pdf.worker.mjs']) {
        expect((await page.request.get(path)).status()).toBe(200);
    }
    const cookie = (await context.cookies()).find(cookie => cookie.name === 'ScanInbox.Session');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(false);
    await page.getByRole('link', { name: 'Pengguna', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pengguna arsip', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Keluar', exact: true }).click();
    await expect(page).toHaveURL(/\/Login/);
    expect((await page.request.get('/api/documents')).status()).toBe(401);
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ iisHttp: 'PASS', login: 'PASS', sharedCatalog: 'PASS', importer: 'ready', documents: result.total, localAssets: 'PASS', adminPage: 'PASS', logout: 'PASS', consoleErrors: 0 }));
    await context.close();
} catch (error) {
    console.error(String(error).replaceAll(credentials.password, '[redacted]'));
    process.exitCode = 1;
} finally { await browser?.close(); }
