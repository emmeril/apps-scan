import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';

export default async function setup() {
    const root = resolve('.');
    const appRoot = process.env.INBOX_TEST_APP_ROOT || root;
    const runtime = resolve(root, 'test-results', `runtime-${Date.now()}`);
    await mkdir(resolve(runtime, 'inbox'), { recursive: true });
    const password = randomBytes(24).toString('base64url');
    process.env.INBOX_TEST_PASSWORD = password;
    process.env.INBOX_TEST_RUNTIME = runtime;
    const env = { ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Development',
        ASPNETCORE_URLS: 'http://127.0.0.1:5097',
        Security__RequireHttps: 'false',
        Storage__InboxPath: resolve(runtime, 'inbox'),
        Storage__DataPath: resolve(runtime, 'data'),
        Storage__PollSeconds: '2', Storage__MinimumAgeSeconds: '2', Storage__MaximumFileMegabytes: '1',
        Logging__LogLevel__Default: 'Warning'
    };
    const dll = process.env.INBOX_TEST_DLL || resolve(root, 'bin/Debug/net10.0/ScanInbox.dll');
    const dotnet = process.env.DOTNET_EXE || 'dotnet';
    const bootstrap = spawnSync(dotnet, [dll, '--create-admin', 'testadmin'], { cwd: appRoot, env, input: `${password}\n${password}\n`, encoding: 'utf8', windowsHide: true });
    if (bootstrap.status !== 0) throw new Error(`Pembuatan akun pengujian gagal: ${bootstrap.stderr || bootstrap.error}`);
    // Reproduce the existing installation's schema before the deletion feature.
    const legacyDatabase = new DatabaseSync(resolve(runtime, 'data/scan-inbox.db'));
    try { legacyDatabase.exec('DROP TABLE DeletedDocuments'); }
    finally { legacyDatabase.close(); }
    const server = spawn(dotnet, [dll], { cwd: appRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    server.stdout.on('data', data => { output += data.toString(); });
    server.stderr.on('data', data => { output += data.toString(); });
    try {
        for (let attempt = 0; attempt < 60; attempt++) {
            if (server.exitCode !== null) throw new Error(`Server pengujian berhenti: ${output}`);
            try {
                const response = await fetch('http://127.0.0.1:5097/Login');
                if (response.ok) return async () => { server.kill(); await new Promise(done => server.once('exit', done)); };
            } catch { }
            await sleep(500);
        }
        throw new Error(`Server pengujian tidak siap: ${output}`);
    } catch (error) { server.kill(); throw error; }
}
