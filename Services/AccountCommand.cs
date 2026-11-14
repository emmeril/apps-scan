using Microsoft.AspNetCore.Identity;
using ScanInbox.Data;

namespace ScanInbox.Services;

public static class AccountCommand {
    public static async Task<int> RunAsync(IServiceProvider services, string command, string name) {
        using var scope = services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var user = await users.FindByNameAsync(name);
        if (command == "--create-admin" && user is not null) { Console.Error.WriteLine("Nama akun sudah digunakan."); return 1; }
        if (command == "--reset-password" && user is null) { Console.Error.WriteLine("Akun tidak ditemukan."); return 1; }
        Console.Write("Password baru (minimal 12 karakter): ");
        var password = ReadPassword();
        Console.Write("Ulangi password: ");
        if (password != ReadPassword()) { Console.Error.WriteLine("Password tidak sama."); return 1; }
        IdentityResult result;
        if (command == "--create-admin") {
            user = new AppUser { UserName = name };
            result = await users.CreateAsync(user, password);
            if (result.Succeeded) result = await users.AddToRoleAsync(user, "Admin");
        } else {
            var token = await users.GeneratePasswordResetTokenAsync(user!);
            result = await users.ResetPasswordAsync(user!, token, password);
            if (result.Succeeded) {
                await users.SetLockoutEndDateAsync(user!, null);
                await users.ResetAccessFailedCountAsync(user!);
                await users.UpdateSecurityStampAsync(user!);
            }
        }
        if (!result.Succeeded) { Console.Error.WriteLine(string.Join(" ", result.Errors.Select(e => e.Description))); return 1; }
        Console.WriteLine("Akun berhasil disimpan.");
        return 0;
    }

    private static string ReadPassword() {
        if (Console.IsInputRedirected) return Console.ReadLine() ?? "";
        var text = new System.Text.StringBuilder();
        while (true) {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); return text.ToString(); }
            if (key.Key == ConsoleKey.Backspace && text.Length > 0) text.Length--;
            else if (!char.IsControl(key.KeyChar)) text.Append(key.KeyChar);
        }
    }
}
