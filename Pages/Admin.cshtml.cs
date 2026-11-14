using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using ScanInbox.Data;

namespace ScanInbox.Pages;
[Authorize(Roles = "Admin")]
public sealed class AdminModel(UserManager<AppUser> users) : PageModel {
    public record AccountRow(string Id, string Name, bool Admin, bool Enabled);
    public List<AccountRow> Accounts { get; set; } = [];
    public string? CurrentUserId => users.GetUserId(User);
    [TempData] public string? Feedback { get; set; }
    public async Task OnGetAsync() => await Load();
    private async Task Load() {
        foreach (var user in await users.Users.OrderBy(u => u.UserName).ToListAsync())
            Accounts.Add(new(user.Id, user.UserName!, await users.IsInRoleAsync(user, "Admin"), user.Enabled));
    }
    private async Task<IActionResult> Invalid(string message) {
        ModelState.AddModelError("", message);
        await Load();
        return Page();
    }
    public async Task<IActionResult> OnPostCreateAsync(string? username, string? password, bool admin) {
        username = username?.Trim();
        if (string.IsNullOrEmpty(username) || username.Length > 100 || string.IsNullOrEmpty(password))
            return await Invalid("Isi nama pengguna (maksimal 100 karakter) dan password.");
        var user = new AppUser { UserName = username };
        var result = await users.CreateAsync(user, password);
        if (result.Succeeded && admin) result = await users.AddToRoleAsync(user, "Admin");
        if (!result.Succeeded) return await Invalid(string.Join(" ", result.Errors.Select(e => e.Description)));
        Feedback = "Akun berhasil dibuat.";
        return RedirectToPage();
    }
    public async Task<IActionResult> OnPostToggleAsync(string? id) {
        if (id is null || id == CurrentUserId) return await Invalid("Kamu tidak dapat menonaktifkan akun sendiri.");
        var user = await users.FindByIdAsync(id);
        if (user is null) return NotFound();
        user.Enabled = !user.Enabled;
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded) return await Invalid("Perubahan akun belum tersimpan. Coba lagi.");
        await users.UpdateSecurityStampAsync(user);
        Feedback = user.Enabled ? "Akun diaktifkan." : "Akun dinonaktifkan dan sesi masuknya dibatalkan.";
        return RedirectToPage();
    }
    public async Task<IActionResult> OnPostResetAsync(string? id, string? password) {
        if (id is null || string.IsNullOrEmpty(password)) return await Invalid("Isi password baru.");
        if (id == CurrentUserId) return await Invalid("Ubah password sendiri melalui halaman Akun saya.");
        var user = await users.FindByIdAsync(id);
        if (user is null) return NotFound();
        var token = await users.GeneratePasswordResetTokenAsync(user);
        var result = await users.ResetPasswordAsync(user, token, password);
        if (!result.Succeeded) return await Invalid(string.Join(" ", result.Errors.Select(e => e.Description)));
        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        await users.UpdateSecurityStampAsync(user);
        Feedback = "Password baru disimpan. Pengguna perlu login kembali.";
        return RedirectToPage();
    }
}
