using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ScanInbox.Data;

namespace ScanInbox.Services;

public sealed class ScanImporter(StorageOptions storage, IServiceScopeFactory scopes, ImportStatus status, ILogger<ScanImporter> log) : BackgroundService {
    private readonly Dictionary<string, (long Length, DateTime Modified)> observed = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, (long Length, DateTime Modified)> imported = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, string> Types = new(StringComparer.OrdinalIgnoreCase) {
        [".pdf"] = "application/pdf", [".png"] = "image/png", [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg"
    };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
        while (!stoppingToken.IsCancellationRequested) {
            try { await ScanOnce(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) {
                status.Update("error");
                log.LogError(ex, "Folder masuk tidak dapat diperiksa.");
            }
            try { await Task.Delay(TimeSpan.FromSeconds(storage.PollSeconds), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task ScanOnce(CancellationToken ct) {
        using (var cleanupScope = scopes.CreateScope()) {
            await cleanupScope.ServiceProvider.GetRequiredService<DocumentDeletion>().PurgeAsync(ct);
        }
        if (!Directory.Exists(storage.InboxPath)) {
            status.Update("missing");
            return;
        }
        var skipped = 0;
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in Directory.EnumerateFiles(storage.InboxPath)) {
            ct.ThrowIfCancellationRequested();
            var ext = Path.GetExtension(path).ToLowerInvariant();
            if (!Types.ContainsKey(ext)) continue;
            seen.Add(path);
            try {
                var info = new FileInfo(path);
                if ((info.Attributes & FileAttributes.ReparsePoint) != 0) { skipped++; continue; }
                var current = (info.Length, info.LastWriteTimeUtc);
                if (current.Length == 0 || current.Length > storage.MaximumBytes) { skipped++; continue; }
                if (imported.TryGetValue(path, out var previous) && previous == current) continue;
                var stable = observed.TryGetValue(path, out var before) && before == current;
                observed[path] = current;
                if (!stable || DateTime.UtcNow - current.LastWriteTimeUtc < TimeSpan.FromSeconds(storage.MinimumAgeSeconds)) continue;
                if (await ImportFile(path, ext, current.LastWriteTimeUtc, ct)) imported[path] = current;
                else skipped++;
            } catch (IOException) { /* The scanner may still hold the file; retry on the next pass. */ }
              catch (UnauthorizedAccessException ex) { skipped++; log.LogWarning(ex, "Tidak dapat membaca {File}. Periksa izin folder.", Path.GetFileName(path)); }
        }
        foreach (var path in observed.Keys.Where(p => !seen.Contains(p)).ToArray()) observed.Remove(path);
        foreach (var path in imported.Keys.Where(p => !seen.Contains(p)).ToArray()) imported.Remove(path);
        status.Update("ready", skipped);
    }

    private async Task<bool> ImportFile(string path, string ext, DateTime modified, CancellationToken ct) {
        var id = Guid.NewGuid();
        var storedName = id.ToString("N") + ext;
        var final = Path.Combine(storage.ArchivePath, storedName);
        var temporary = final + ".partial";
        try {
            string hash;
            long length;
            // Deny writes during the copy so every served document is an immutable snapshot.
            await using (var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None, 65536, FileOptions.Asynchronous)) {
                if (input.Length > storage.MaximumBytes) return false;
                var header = new byte[8];
                var read = await input.ReadAsync(header, ct);
                if (!ValidHeader(ext, header.AsSpan(0, read))) return false;
                input.Position = 0;
                await using var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None, 65536, FileOptions.Asynchronous);
                await input.CopyToAsync(output, ct);
                length = output.Length;
                output.Position = 0;
                hash = Convert.ToHexString(await SHA256.HashDataAsync(output, ct));
            }
            var sourceKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Path.GetFileName(path).ToUpperInvariant())));
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<InboxDb>();
            if (await db.Documents.AnyAsync(d => d.SourceKey == sourceKey && d.Sha256 == hash, ct)) return true;
            File.Move(temporary, final);
            db.Documents.Add(new ScanDocument {
                Id = id, Name = Path.GetFileName(path), StoredName = storedName,
                SourceKey = sourceKey, Sha256 = hash, Extension = ext, ContentType = Types[ext],
                Bytes = length, SourceModifiedUtc = modified, ImportedUtc = DateTime.UtcNow
            });
            try { await db.SaveChangesAsync(ct); }
            catch { File.Delete(final); throw; }
            log.LogInformation("Dokumen diarsipkan: {Name} ({Bytes} byte).", Path.GetFileName(path), length);
            return true;
        } finally {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    public static bool ValidHeader(string ext, ReadOnlySpan<byte> bytes) => ext switch {
        ".pdf" => bytes.StartsWith("%PDF-"u8),
        ".png" => bytes.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
        ".jpg" or ".jpeg" => bytes.StartsWith(new byte[] { 255, 216, 255 }),
        _ => false
    };
}
