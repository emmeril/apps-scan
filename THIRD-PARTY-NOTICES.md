# Komponen pihak ketiga

- ASP.NET Core, ASP.NET Core Identity, dan Entity Framework Core: Microsoft/.NET Foundation, MIT. Dipasang melalui framework .NET dan NuGet. [Source ASP.NET Core](https://github.com/dotnet/aspnetcore), [source EF Core](https://github.com/dotnet/efcore).
- SQLite: public domain. [Informasi lisensi](https://sqlite.org/copyright.html). Paket native terkait diselesaikan oleh Microsoft.EntityFrameworkCore.Sqlite/SQLitePCLRaw.
- PDF.js/pdfjs-dist: Mozilla dan kontributor, Apache-2.0. `npm run assets` menyertakan LICENSE dan direktori font/CMap/WASM beserta lisensi terkait ke paket publish. [Source PDF.js](https://github.com/mozilla/pdf.js).
- Playwright: Microsoft, Apache-2.0; hanya dipakai untuk pengujian, tidak diperlukan pada server produksi. [Source Playwright](https://github.com/microsoft/playwright).

Versi JavaScript dikunci di package-lock.json; referensi NuGet dikunci pada versi eksplisit di ScanInbox.csproj. Perbarui dependensi secara terencana, ulangi build dan pengujian, kemudian deploy paket baru.
