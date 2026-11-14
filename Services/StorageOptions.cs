namespace ScanInbox.Services;

public sealed class StorageOptions {
    public required string InboxPath { get; init; }
    public required string DataPath { get; init; }
    public string ArchivePath => Path.Combine(DataPath, "documents");
    public string KeysPath => Path.Combine(DataPath, "keys");
    public int PollSeconds { get; init; }
    public int MinimumAgeSeconds { get; init; }
    public long MaximumBytes { get; init; }

    public static StorageOptions Load(IConfiguration config, string root) {
        string Resolve(string key, string fallback) => Path.TrimEndingDirectorySeparator(Path.GetFullPath(config[key] ?? fallback, root));
        var inbox = Resolve("Storage:InboxPath", "runtime/inbox");
        var data = Resolve("Storage:DataPath", "runtime/data");
        bool ContainsPath(string parent, string child) => child.Equals(parent, StringComparison.OrdinalIgnoreCase)
            || child.StartsWith(parent + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
        var web = Path.Combine(root, "wwwroot");
        if (ContainsPath(inbox, data) || ContainsPath(data, inbox) || ContainsPath(web, inbox) || ContainsPath(web, data))
            throw new InvalidOperationException("InboxPath dan DataPath harus terpisah dan berada di luar wwwroot.");
        var maximumMb = config.GetValue("Storage:MaximumFileMegabytes", 100);
        return new StorageOptions {
            InboxPath = inbox, DataPath = data,
            PollSeconds = Math.Clamp(config.GetValue("Storage:PollSeconds", 5), 2, 300),
            MinimumAgeSeconds = Math.Clamp(config.GetValue("Storage:MinimumAgeSeconds", 10), 2, 3600),
            MaximumBytes = Math.Clamp(maximumMb, 1, 1024) * 1024L * 1024L
        };
    }
}
