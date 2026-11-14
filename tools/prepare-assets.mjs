import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = `${root}/node_modules/pdfjs-dist`;
const destination = `${root}/wwwroot/vendor/pdfjs`;
await mkdir(destination, { recursive: true });
for (const name of ['pdf.mjs', 'pdf.worker.mjs']) {
    await cp(`${source}/build/${name}`, `${destination}/${name}`);
}
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'LICENSE']) {
    await cp(`${source}/${name}`, `${destination}/${name}`, { recursive: true });
}
console.log('Aset PDF.js lokal siap. Tidak ada CDN yang digunakan saat aplikasi berjalan.');
