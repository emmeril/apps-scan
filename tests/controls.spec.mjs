import { test, expect } from '@playwright/test';
import { writeFile, utimes } from 'node:fs/promises';
import { resolve } from 'node:path';
import { samplePdf } from './fixtures.mjs';

test('remaining account controls, validation, keyboard navigation and long filenames', async ({ page, request }) => {
    test.setTimeout(90000);
    // Other account scenarios can consume the shared application's login limit.
    await expect.poll(async () => (await request.get('/Login')).status(), {
        timeout: 65000, intervals: [1000]
    }).toBe(200);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/Login');
    await page.screenshot({ path: 'test-results/login.png', fullPage: true });
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    expect(await page.getByLabel('Nama pengguna', { exact: true }).evaluate(input => input.validity.valueMissing)).toBe(true);
    await page.getByLabel('Nama pengguna', { exact: true }).fill('testadmin');
    await page.getByLabel('Password', { exact: true }).fill(process.env.INBOX_TEST_PASSWORD);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Dokumen bersama', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Scan bersama', exact: true }).click();
    await page.getByRole('link', { name: 'Pengguna', exact: true }).click();
    await page.locator('#new-name').fill('secondadmin');
    await page.locator('#new-password').fill(process.env.INBOX_TEST_PASSWORD + 'z');
    await page.getByLabel('Beri akses admin').check();
    await page.getByRole('button', { name: 'Buat akun', exact: true }).click();
    const row = page.locator('.user-row').filter({ has: page.getByRole('heading', { name: 'secondadmin', exact: true }) });
    await expect(row).toContainText('Admin · Aktif');
    await page.locator('#new-name').fill('secondadmin');
    await page.locator('#new-password').fill(process.env.INBOX_TEST_PASSWORD + 'z');
    await page.getByRole('button', { name: 'Buat akun', exact: true }).click();
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await page.getByRole('link', { name: 'Akun saya', exact: true }).click();
    await page.getByLabel('Password sekarang', { exact: true }).fill('wrong-password');
    await page.getByLabel('Password baru', { exact: true }).fill(process.env.INBOX_TEST_PASSWORD + 'z');
    await page.getByLabel('Ulangi password baru', { exact: true }).fill('different-password');
    await page.getByRole('button', { name: 'Simpan password', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Pengulangan password tidak sama');
    await page.getByLabel('Password sekarang', { exact: true }).fill('wrong-password');
    await page.getByLabel('Password baru', { exact: true }).fill(process.env.INBOX_TEST_PASSWORD + 'z');
    await page.getByLabel('Ulangi password baru', { exact: true }).fill(process.env.INBOX_TEST_PASSWORD + 'z');
    await page.getByRole('button', { name: 'Simpan password', exact: true }).click();
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await page.getByLabel('Password sekarang', { exact: true }).fill(process.env.INBOX_TEST_PASSWORD);
    await page.getByLabel('Password baru', { exact: true }).fill(process.env.INBOX_TEST_PASSWORD + 'z');
    await page.getByLabel('Ulangi password baru', { exact: true }).fill(process.env.INBOX_TEST_PASSWORD + 'z');
    await page.getByRole('button', { name: 'Simpan password', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Password berhasil diubah');
    await page.getByRole('link', { name: 'Dokumen', exact: true }).click();
    const name = "contoh-dokumen-pengujian-dengan-nama-sangat-panjang-untuk-memeriksa-tampilan-mobile.pdf";
    const path = resolve(process.env.INBOX_TEST_RUNTIME, 'inbox', name);
    await writeFile(path, samplePdf());
    const old = new Date(Date.now() - 10000);
    await utimes(path, old, old);
    await expect.poll(async () => {
        const data = await (await page.request.get('/api/documents?search=' + encodeURIComponent(name))).json();
        return data.total;
    }).toBe(1);
    await page.getByLabel('Cari nama dokumen').fill(name);
    await page.getByRole('button', { name: 'Cari dokumen', exact: true }).click();
    for (const width of [320, 360, 600, 900, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const card = page.getByRole('button', { name: 'Preview ' + name, exact: true });
    await expect(card.locator('canvas')).toBeVisible();
    await page.screenshot({ path: 'test-results/gallery.png', fullPage: true });
    await page.getByRole('button', { name: 'Perbarui', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(card).toBeFocused();
    expect(await card.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page.locator('#preview-status')).toHaveText('Halaman 1 dari 2');
    await page.screenshot({ path: 'test-results/pdf-preview.png' });
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
    await page.getByRole('button', { name: 'Keluar', exact: true }).click();
    await expect(page).toHaveURL(/Login/);
    expect(errors).toEqual([]);
});
