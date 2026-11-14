namespace ScanInbox.Services;

public sealed class ImportStatus {
    private readonly object gate = new();
    private DateTime? checkedUtc;
    private string state = "starting";
    private int skipped;
    public void Update(string value, int skippedFiles = 0) {
        lock (gate) { state = value; checkedUtc = DateTime.UtcNow; skipped = skippedFiles; }
    }
    public object Snapshot() {
        lock (gate) return new { state, checkedUtc, skipped };
    }
}
