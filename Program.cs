using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ScanInbox.Data;
using ScanInbox.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false)
    .AddEnvironmentVariables();
var storage = StorageOptions.Load(builder.Configuration, builder.Environment.ContentRootPath);
Directory.CreateDirectory(storage.DataPath);
Directory.CreateDirectory(storage.ArchivePath);
Directory.CreateDirectory(storage.KeysPath);
builder.Services.AddSingleton(storage);
builder.Services.AddDbContext<InboxDb>(options => options.UseSqlite(
    new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder {
        DataSource = Path.Combine(storage.DataPath, "scan-inbox.db"), ForeignKeys = true
    }.ToString()));
builder.Services.AddDataProtection().SetApplicationName("ScanInbox")
    .PersistKeysToFileSystem(new DirectoryInfo(storage.KeysPath));
builder.Services.AddIdentity<AppUser, IdentityRole>(options => {
    options.Password.RequiredLength = 12;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireDigit = false;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.User.RequireUniqueEmail = false;
}).AddEntityFrameworkStores<InboxDb>().AddDefaultTokenProviders();
var requireHttps = builder.Configuration.GetValue("Security:RequireHttps", true);
builder.Services.ConfigureApplicationCookie(options => {
    options.Cookie.Name = "ScanInbox.Session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = requireHttps ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = true;
    options.LoginPath = "/Login";
    options.AccessDeniedPath = "/Denied";
    options.Events.OnRedirectToLogin = context => {
        if (context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/documents"))
            context.Response.StatusCode = 401;
        else context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context => {
        if (context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/documents"))
            context.Response.StatusCode = 403;
        else context.Response.Redirect(context.RedirectUri);
        return Task.CompletedTask;
    };
});
builder.Services.Configure<SecurityStampValidatorOptions>(options => options.ValidationInterval = TimeSpan.Zero);
builder.Services.AddAuthorization();
builder.Services.AddRazorPages(options => {
    options.Conventions.AuthorizeFolder("/");
    options.Conventions.AllowAnonymousToPage("/Login");
    options.Conventions.AllowAnonymousToPage("/Error");
});
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = 429;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "local",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.Services.AddSingleton<ImportStatus>();
builder.Services.AddHostedService<ScanImporter>();

var app = builder.Build();
using (var scope = app.Services.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<InboxDb>();
    await db.Database.EnsureCreatedAsync();
    await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    if (!await roleManager.RoleExistsAsync("Admin"))
        await roleManager.CreateAsync(new IdentityRole("Admin"));
}
if (args.Length == 2 && args[0] is "--create-admin" or "--reset-password") {
    Environment.ExitCode = await AccountCommand.RunAsync(app.Services, args[0], args[1]);
    return;
}
if (!File.Exists(Path.Combine(app.Environment.WebRootPath, "vendor", "pdfjs", "pdf.mjs")))
    throw new InvalidOperationException("Aset PDF.js belum disiapkan. Jalankan npm ci lalu npm run assets sebelum menjalankan/publish aplikasi.");

if (!app.Environment.IsDevelopment()) app.UseExceptionHandler("/Error");
if (requireHttps) {
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.Use(async (context, next) => {
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "same-origin";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers.ContentSecurityPolicy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    context.Response.Headers.CacheControl = "no-store";
    await next();
});
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapRazorPages();
app.MapGet("/api/documents", async (InboxDb db, ImportStatus status, string? search, string? type, int? page, CancellationToken ct) => {
    var query = db.Documents.AsNoTracking();
    search = search?.Trim();
    if (search?.Length > 160) return Results.BadRequest();
    if (!string.IsNullOrEmpty(search)) query = query.Where(d => d.Name.Contains(search));
    if (type == "pdf") query = query.Where(d => d.Extension == ".pdf");
    else if (type == "image") query = query.Where(d => d.Extension != ".pdf");
    var total = await query.CountAsync(ct);
    var pages = Math.Max(1, (int)Math.Ceiling(total / 24d));
    var current = Math.Clamp(page ?? 1, 1, pages);
    var docs = await query.OrderByDescending(d => d.ImportedUtc).ThenByDescending(d => d.Id)
        .Skip((current - 1) * 24).Take(24)
        .Select(d => new { d.Id, d.Name, d.ContentType, d.Bytes,
            SourceModifiedUtc = DateTime.SpecifyKind(d.SourceModifiedUtc, DateTimeKind.Utc),
            ImportedUtc = DateTime.SpecifyKind(d.ImportedUtc, DateTimeKind.Utc) }).ToListAsync(ct);
    return Results.Ok(new { documents = docs, total, page = current, pages, import = status.Snapshot() });
}).RequireAuthorization();
app.MapGet("/documents/{id:guid}/content", async (Guid id, bool? download, InboxDb db, CancellationToken ct) => {
    var doc = await db.Documents.AsNoTracking().SingleOrDefaultAsync(d => d.Id == id, ct);
    if (doc is null) return Results.NotFound();
    var path = Path.Combine(storage.ArchivePath, doc.StoredName);
    try {
        var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Results.File(stream, doc.ContentType, download == true ? doc.Name : null, enableRangeProcessing: true);
    } catch (FileNotFoundException) { return Results.NotFound(); }
      catch (DirectoryNotFoundException) { return Results.NotFound(); }
}).RequireAuthorization();
app.Run();

public partial class Program { }
