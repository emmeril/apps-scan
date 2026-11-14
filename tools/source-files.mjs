import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = new Set(['.git', 'node_modules', 'bin', 'obj', 'runtime', 'artifacts', 'test-results', 'playwright-report']);
const files = [];
async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (ignored.has(entry.name) || entry.name === 'appsettings.Local.json' || entry.name.startsWith('.env')) continue;
        const path = resolve(directory, entry.name);
        const name = relative(root, path).split(sep).join('/');
        if (name === 'wwwroot/vendor') continue;
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile()) {
            if (/\.(pfx|key|db|db-shm|db-wal|log)$/i.test(name)) throw new Error(`Private file excluded from source: ${name}`);
            files.push({ path: name, binary: name.endsWith('.png'), content: name.endsWith('.png') ? undefined : await readFile(path, 'utf8') });
        }
    }
}
await walk(root);
process.stdout.write(JSON.stringify(files.sort((a, b) => a.path.localeCompare(b.path))));
