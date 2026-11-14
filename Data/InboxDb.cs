using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ScanInbox.Data;

public sealed class AppUser : IdentityUser {
    public bool Enabled { get; set; } = true;
}

public sealed class ScanDocument {
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string StoredName { get; set; }
    public required string SourceKey { get; set; }
    public required string Sha256 { get; set; }
    public required string Extension { get; set; }
    public required string ContentType { get; set; }
    public long Bytes { get; set; }
    public DateTime SourceModifiedUtc { get; set; }
    public DateTime ImportedUtc { get; set; }
}

public sealed class InboxDb(DbContextOptions<InboxDb> options) : IdentityDbContext<AppUser>(options) {
    public DbSet<ScanDocument> Documents => Set<ScanDocument>();
    protected override void OnModelCreating(ModelBuilder model) {
        base.OnModelCreating(model);
        model.Entity<ScanDocument>().HasIndex(d => new { d.SourceKey, d.Sha256 }).IsUnique();
        model.Entity<ScanDocument>().HasIndex(d => d.ImportedUtc);
    }
}
