using Microsoft.EntityFrameworkCore;
using ScanInbox.Data;

namespace ScanInbox.Services;

public sealed class DocumentDeletion(InboxDb db, StorageOptions storage, ILogger<DocumentDeletion> log) {
    public async Task<bool> DeleteAsync(Guid id, string userId, CancellationToken ct) {
        if (!await db.Documents.AnyAsync(d => d.Id == id, ct)) return false;
        if (await db.DeletedDocuments.AnyAsync(d => d.DocumentId == id, ct)) return true;
        var marker = new DeletedScanDocument {
            DocumentId = id, DeletedUtc = DateTime.UtcNow, DeletedBy = userId
        };
        db.DeletedDocuments.Add(marker);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) {
            db.Entry(marker).State = EntityState.Detached;
            if (!await db.DeletedDocuments.AnyAsync(d => d.DocumentId == id, ct)) throw;
        }
        log.LogInformation("Dokumen {DocumentId} dihapus oleh admin {UserId}.", id, userId);
        // Once committed, the marker blocks access even if an open file delays cleanup.
        await PurgeAsync(CancellationToken.None);
        return true;
    }

    public async Task PurgeAsync(CancellationToken ct) {
        var pending = await db.DeletedDocuments.Where(d => !d.FileRemoved)
            .OrderBy(d => d.DeletedUtc).Take(24)
            .Join(db.Documents, d => d.DocumentId, d => d.Id,
                (marker, document) => new { Marker = marker, document.StoredName }).ToListAsync(ct);
        foreach (var item in pending) {
            try {
                File.Delete(Path.Combine(storage.ArchivePath, item.StoredName));
                item.Marker.FileRemoved = true;
            } catch (IOException ex) {
                log.LogWarning(ex, "Pembersihan file dokumen {DocumentId} akan dicoba lagi.", item.Marker.DocumentId);
            } catch (UnauthorizedAccessException ex) {
                log.LogWarning(ex, "Periksa izin arsip untuk menghapus file dokumen {DocumentId}.", item.Marker.DocumentId);
            }
        }
        await db.SaveChangesAsync(ct);
    }
}
