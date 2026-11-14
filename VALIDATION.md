# Verifikasi Scan bersama

Tanggal: 14 November 2026.

## Lingkungan dan hasil

- Windows Server 2022 Standard, build 10.0.20348.
- .NET SDK 10.0.404, ASP.NET Core/.NET Runtime 10.0.15.
- Node.js 24.22.3, PDF.js 6.5.438, Playwright 1.65.1, Chromium 159.
- `dotnet build --no-restore`: berhasil, 0 warning, 0 error.
- Publish Release `win-x64`, framework-dependent: berhasil; web.config untuk IIS disertakan.
- Enam skenario `tests/archive.spec.mjs` lulus pada paket publish Release final, 37,7 detik.
- Satu skenario tambahan `tests/controls.spec.mjs` lulus pada paket publish yang sama, 9,7 detik termasuk startup.
- Uji contrast: 14 pasangan lulus; teks terkecil yang diuji 5,95:1, batas komponen minimum 3,44:1.
- npm audit pada saat install: 0 kerentanan yang dilaporkan.
- `dotnet list package --vulnerable --include-transitive`: tidak ada paket rentan yang dilaporkan sumber NuGet saat pemeriksaan.
- [GitHub Actions run 43580671076](https://github.com/emmeril/apps-scan/actions/runs/43580671076) berhasil: build, tujuh skenario browser/integrasi, pemeriksaan kontras, publish IIS, dan upload artifact `scan-inbox-iis-win-x64`. Source aplikasi yang diuji adalah commit `34b04ef720fda7dedb7f10417f7d8d7db7829106`; pembaruan catatan verifikasi setelahnya hanya mengubah dokumentasi.

Satu pemeriksaan awal pada tes keyboard menggunakan focus programatik setelah klik mouse dan tidak mengaktifkan `:focus-visible`; tes diperbaiki untuk memakai Tab sebenarnya. Pemeriksaan keyboard sesudahnya lulus. Pemeriksaan akhir juga menemukan dan memperbaiki penandaan UTC saat membaca timestamp SQLite serta pengecualian folder hasil tes dari paket publish.

## Skenario integrasi

| Skenario | Bukti hasil |
|---|---|
| Tanpa login | Catalog dan endpoint file mengembalikan 401; Admin mengarahkan ke login |
| Login gagal/berhasil | Pesan gagal generik muncul; akun yang benar masuk ke galeri |
| Antiforgery | POST Logout tanpa token ditolak 400 |
| Folder kosong | Pesan belum ada hasil scan muncul |
| File terkunci/sedang ditulis | Belum diimpor sebelum file ditutup |
| Input tidak valid | Ekstensi sementara, header salah, dan file melebihi batas tidak diimpor |
| Impor | PDF dan PNG yang stabil masuk; nama asli dan file sumber dipertahankan |
| Duplikasi | Menulis nama+isi sama tidak menambah entri |
| Integritas arsip | SHA-256 download sama dengan sumber pengujian |
| Rentang PDF | Permintaan byte 0-4 mengembalikan 206 dan `%PDF-` |
| Penyimpanan privat | URL runtime database mengembalikan 404 |
| File asal dihapus | Salinan arsip masih dapat didownload |
| Waktu | Timestamp API menyertakan Z/UTC agar browser mengonversinya dengan benar |
| Galeri | Thumbnail PDF dan PNG benar-benar dirender |
| Preview PDF | Dua halaman dapat dibuka, berganti halaman, dan di-zoom |
| Preview gambar | Gambar ditampilkan dan pilihan 200% berfungsi |
| PDF rusak | Pesan gagal preview muncul; opsi download tetap tersedia |
| Pencarian/filter | Hasil kosong dan filter hanya gambar bekerja |
| Refresh gagal/pulih | HTTP 503 menampilkan pesan; Perbarui setelah pulih memuat kembali daftar |
| Pagination | 27 file menghasilkan 24 dan 3 entri pada dua halaman |
| Deteksi otomatis | File baru muncul tanpa memuat ulang halaman secara manual |
| Admin | Membuat pengguna, membuat admin kedua, menolak nama duplikat, reset, nonaktif/aktif |
| Batas role | Pengguna biasa mendapat halaman akses dibatasi saat membuka Admin |
| Password | Admin mengubah password sendiri dan mereset pengguna; user biasa ditolak pada GET/POST perubahan password |
| Sesi | Reset/nonaktif akun membatalkan sesi pada permintaan berikutnya; login nonaktif ditolak |
| Folder masuk hilang | Peringatan muncul; dokumen arsip tetap dapat diakses |
| Offline pada runtime | Browser tidak meminta aset ke domain eksternal dalam skenario preview |

## Catatan click-through

Setiap kontrol berikut dioperasikan melalui browser otomatis, bukan hanya diperiksa source-nya:

| Kontrol | Hasil |
|---|---|
| Masuk, termasuk Enter | Validasi wajib isi, pesan gagal, kemudian galeri |
| Scan bersama / Dokumen | Navigasi ke galeri |
| Pengguna | Navigasi ke pengelolaan akun untuk admin |
| Akun saya | Form perubahan password khusus admin; menu tidak muncul untuk user biasa |
| Keluar | Cookie sign-in diakhiri dan halaman login tampil |
| Cari nama + Cari dokumen | Hasil sesuai nama atau pesan hasil kosong |
| Jenis dokumen | Pilihan gambar menghasilkan hanya PNG contoh |
| Perbarui | Memuat data, menampilkan kegagalan koneksi, pulih setelah retry |
| Sebelumnya/Berikutnya galeri | Berpindah halaman dan memperbarui status tombol |
| Thumbnail | Membuka dialog preview dokumen yang dipilih |
| Sebelumnya/Berikutnya PDF | Pindah antara halaman 1 dan 2 |
| Ukuran preview | Pilihan pas lebar/150% PDF dan 200% gambar berfungsi |
| Download dokumen | Download dimulai dengan nama asli dan byte yang sesuai |
| Tutup / Escape | Dialog ditutup, fokus kembali ke pemicu |
| Buat akun | Membuat pengguna baru, menolak nama yang sudah dipakai |
| Beri akses admin | Checkbox menghasilkan akun admin kedua |
| Reset password / Simpan password baru | Details terbuka, password berubah, sesi lama dibatalkan |
| Nonaktifkan/Aktifkan | Status berubah; akses akun mengikuti status |
| Simpan password | Untuk admin, menolak input tidak cocok/password lama salah dan berhasil untuk input benar; user biasa ditolak di backend |
| Keyboard Tab/Shift+Tab/Enter | Fokus bergerak ke kontrol dan thumbnail dapat diaktifkan |

Tidak ada error JavaScript uncaught pada skenario preview dan pemeriksaan kontrol tambahan. Respons yang sengaja gagal dalam tes adalah bagian dari pengujian error state.

## Responsif dan aksesibilitas yang diperiksa

- Galeri: 320, 360, 600, 900, dan 1440 px; nama sangat panjang tetap membungkus tanpa overflow horizontal.
- Dialog: 360, 600, 900, dan 1440 px; halaman tidak melebar keluar viewport. Area dokumen sendiri dapat digeser saat zoom, sesuai fungsi preview.
- Pembesaran teks 200% pada viewport 720 px tidak menghasilkan overflow halaman.
- Native dialog menjaga fokus; Escape mengembalikan fokus ke thumbnail.
- Focus ring terlihat saat memakai Tab; kontrol memakai elemen native dan nama yang dapat diakses.
- Kontras dihitung dengan rumus luminance WCAG pada `tools/check-contrast.mjs`.
- Aset gambar memiliki dimensi, bingkai thumbnail memesan ruang, dan tidak ada animasi non-esensial.

Ini bukan klaim sertifikasi WCAG. Screen reader nyata dan keyboard virtual perangkat fisik belum diuji. Lighthouse/Core Web Vitals tidak diukur.

## Delivery Gate antislop

Arah visual disetujui pemilik sebelum UI dibuat. Dials: ENERGY 1 / RHYTHM 2 / MOTION 1. Status PASS di bawah merujuk pada batas pemeriksaan source dan browser yang dijelaskan di atas.

| Aturan | Status dan bukti |
|---|---|
| R-01 | PASS: warna putih hangat dan hijau tua mengikuti arah yang disetujui, tanpa gradient |
| R-02 | PASS: copy UI menggunakan kalimat langsung, tanpa em dash |
| R-03 | PASS: reflow diuji 320 sampai 1440 px; target kontrol minimal 44 px |
| R-04 | PASS: tidak memakai ikon dekoratif; aksi ditulis sebagai teks |
| R-05 | PASS: header ringkas, rak pencarian, lalu dokumen; struktur mengikuti tugas mengambil scan |
| R-06 | PASS: Segoe UI dipilih untuk kesesuaian lingkungan Windows; alasan di DESIGN.md |
| R-07 | PASS: latar polos; bingkai kertas adalah preview dokumen sebenarnya |
| R-08 | PASS: tidak ada panah dekoratif pada tombol |
| R-09 | PASS: tidak ada badge promosi atau indikator status dekoratif |
| R-10 | PASS: tidak menggunakan glassmorphism |
| R-11 | PASS: kertas persegi, kontrol 6 px, dialog 12 px |
| R-12 | PASS: tidak memakai shadow dekoratif pada kartu |
| R-13 | PASS: tidak memakai glow |
| R-14 | PASS: grid berulang untuk membandingkan dokumen nyata, bukan kartu fitur pemasaran |
| R-15 | PASS: label aksi spesifik seperti Cari dokumen, Download dokumen, dan Simpan password |
| R-16 | PASS: tidak ada klaim pemasaran/buzzword pada UI |
| R-17 | PASS: jumlah dokumen dihitung dari database, bukan statistik rekaan |
| R-18 | PASS: tidak ada testimoni, avatar, atau identitas rekaan |
| R-19 | PASS: tidak ada animasi otomatis; motion sesuai dial 1 |
| R-20 | PASS: bingkai kertas dan thumbnail isi menjadi identitas arsip scan |
| R-21 | PASS: tema terang dipilih secara eksplisit oleh pemilik |
| R-22 | PASS: tidak memakai ilustrasi stok/dekoratif |
| R-23 | PASS: nama teks sementara dan galeri/preview disetujui; tanpa logo yang diasumsikan |
| R-24 | PASS: semua link navigasi memiliki halaman dan telah diuji |
| R-25 | PASS: 14 pasangan kontras lulus perhitungan; hasil rinci dicatat di atas |
| R-26 | PASS: kontrol berfungsi sesuai daftar click-through |
| R-27 | PASS: empty, loading, error, dan retry diuji pada daftar dan preview |
| R-28 | PASS: tidak ada FAQ generik pada aplikasi |
| R-29 | PASS: putih/ink netral dengan satu aksen hijau; warning hanya untuk keadaan nyata |
| R-30 | PASS: tampilan dibangun dari kebutuhan arsip, tanpa meniru produk tertentu |
| R-31 | PASS: alasan warna, tipe, jarak, komposisi, radius, dan kartu dicatat di DESIGN.md |
| R-32 | PASS: Tab/Shift+Tab/Enter/Escape diuji; focus ring dan pengembalian fokus diperiksa |
| R-33 | PASS: UI ditulis langsung melalui perubahan source, bukan script pengganti CSS |
| R-34 | PASS: hanya satu tema yang disetujui dan diuji; tidak ada toggle setengah jadi |
| R-35 | PASS: build/publish dijalankan dan seluruh jenis kontrol diclick-through; daftar bukti tersedia |
| R-36 | PASS: tidak ada klaim compliance/security/performa yang dibuat-buat |
| R-37 | PASS: arah pemilik dan Design Read dicatat sebelum implementasi UI |
| R-38 | PASS: screenshot/fixture jelas berupa dokumen contoh pengujian; runtime tanpa data menampilkan empty state |
| R-39 | PASS: native semantic HTML, label, lang=id, landmark, judul, pointer/disabled/focus state tersedia |
| R-40 | PASS: media memiliki dimensi/ruang tetap, tanpa resource pihak ketiga saat runtime; tidak mengarang skor performa |

Liveliness PASS: dokumen menjadi fokus, ruang memisahkan pencarian dari hasil, hijau menandai aksi utama, dan bingkai kertas mengulang motif arsip. Dials sesuai tampilan dan Design Read tercatat.

Craftsmanship C-1 sampai C-5 PASS: alasan visual tercatat, kontrol bekerja, isi sesuai tugas, layout/state diuji, dan tidak ada klaim/data operasional rekaan. Angka/screenshot pengujian tidak dipasang sebagai data kantor.

## Belum diverifikasi

- Scan dari panel Epson L6260 ke Windows Server 2022, termasuk kondisi desktop terkunci/logout/reboot.
- Akses dari komputer client lain serta scan printer fisik; pengujian IIS di bawah dilakukan dari browser yang berjalan pada server.
- Browser Safari/Firefox, screen reader, keyboard virtual HP fisik, dan volume dokumen besar.
- PDF terenkripsi, semua variasi encoding/codec scanner, dan beban beberapa pengguna bersamaan.

Pengujian otomatis awal memakai Kestrel loopback pada Windows Server 2022 dengan penyimpanan sementara dan dokumen contoh. Deployment IIS HTTP kemudian diverifikasi secara terpisah seperti di bawah. Integrasi printer masih membutuhkan pengujian fisik.

## Deployment IIS HTTP melalui IPv4

Konfigurasi diminta pemilik: HTTP melalui IP, tanpa DNS/HTTPS. Alamat deployment aktual dan kredensial admin disimpan secara lokal pada server, tidak dimasukkan ke repository publik.

- .NET 10 Hosting Bundle 10.0.15 dipasang setelah checksum SHA-512 cocok dengan metadata Microsoft dan Authenticode berstatus Valid dari Microsoft Corporation; installer exit 0.
- IIS Application Initialization berhasil dipasang tanpa memerlukan reboot.
- Script `scripts/Install-IIS.ps1` lulus parser PowerShell dan dijalankan untuk pemasangan pertama.
- Situs IIS dan Application Pool khusus ScanInbox aktif, binding IPv4 HTTP port 8080, tanpa hostname.
- RequireHttps=false pada konfigurasi deployment; browser tidak diarahkan ke HTTPS.
- Folder Incoming, Data, dan Setup terpisah; Data hanya memberi akses pada SYSTEM, administrator, dan Application Pool; Setup hanya pada SYSTEM/administrator.
- Admin awal dibuat dengan password acak; kredensial tidak dikirim ke stdout, source, atau repository.
- Firewall TCP 8080 dibatasi untuk LocalSubnet pada profil Private/Domain.
- Default Web Site di port 80 tetap aktif dan bindingnya dipertahankan.
- `tools/verify-iis.mjs` dijalankan terhadap URL IPv4 IIS aktual: login PASS, katalog bersama PASS, importer ready, aset lokal PASS, halaman admin PASS, logout PASS, 0 uncaught JavaScript error.
- API dokumen mengembalikan 401 sebelum login dan sesudah logout, serta 200 saat login.
- Cookie sesi pada HTTP: HttpOnly=true, Secure=false, sesuai konfigurasi HTTP yang diminta.
- Arsip deployment masih kosong pada saat verifikasi; tidak ada dokumen kantor/contoh pengujian yang dimasukkan ke arsip produksi.

Script verifikasi membaca kredensial dari file privat yang diberikan sebagai argumen, bukan dari source atau command line password. Verifikasi ini tidak membuktikan jalur firewall dari setiap VLAN kantor, perilaku setelah reboot server, atau penerimaan scan dari panel printer.

## Hostname untuk reverse proxy

Atas permintaan pemilik, AllowedHosts di konfigurasi aplikasi, contoh konfigurasi, installer, dan deployment IIS diset ke "*". Application Pool ScanInbox direcycle untuk memuat konfigurasi lokal.

- URL IP dan dua Host header hostname percobaan diterima IIS dengan HTTP 200 pada halaman Login, tanpa pengalihan ke HTTPS.
- API dokumen melalui Host header percobaan tetap mengembalikan 401 tanpa sesi login.
- Parser PowerShell installer lulus setelah perubahan nilai AllowedHosts.
- Konfigurasi Cloudflare/DNS/tunnel belum menjadi bagian pengujian ini; pengujian membuktikan penerimaan hostname pada origin IIS.

## Perubahan password hanya oleh admin

Permintaan pemilik: user biasa tidak dapat mengganti password sendiri. Admin tetap dapat mengganti password sendiri dan mengganti password pengguna melalui halaman Pengguna.

- `/Account` diberi `[Authorize(Roles = "Admin")]` pada PageModel untuk seluruh GET/POST.
- Menu Akun saya hanya dirender bagi admin. Petunjuk pembuatan akun menjelaskan bahwa password pengguna hanya diubah admin.
- Tujuh skenario browser/integrasi lulus setelah perubahan, 44,5 detik; build berhasil tanpa warning/error.
- User biasa tidak melihat menu Akun saya dan ditolak saat membuka `/Account` langsung.
- POST `/Account` memakai token antiforgery yang valid tetap ditolak bagi user biasa.
- Upaya user biasa memanggil handler reset password admin dengan token valid juga ditolak.
- Login dengan password semula tetap berhasil setelah kedua upaya tersebut, membuktikan password tidak berubah.
- Admin berhasil mereset password user dan mengganti password admin sendiri; pengujian tetap memeriksa pembatalan sesi setelah reset/nonaktif akun.
- Pengujian memakai database dan akun sementara, terpisah dari akun/password server produksi.
- Skenario pembatasan password juga dijalankan langsung pada paket Release yang akan dipasang: lulus, 6,2 detik termasuk startup.
- Paket dipasang pada IIS setelah backup aplikasi dan Data. SHA-256 assembly di server cocok dengan paket Release; halaman Login merespons HTTP 200 dan AllowedHosts tetap "*".
