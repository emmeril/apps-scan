using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.RateLimiting;
using ScanInbox.Data;

namespace ScanInbox.Pages;

[EnableRateLimiting("login")]
public sealed class LoginModel(SignInManager<AppUser> signIn, UserManager<AppUser> users) : PageModel {
    [BindProperty, Required, StringLength(100)] public string Username { get; set; } = "";
    [BindProperty, Required] public string Password { get; set; } = "";
    [BindProperty(SupportsGet = true)] public string? ReturnUrl { get; set; }
    public IActionResult OnGet() => User.Identity?.IsAuthenticated == true ? RedirectToPage("/Index") : Page();
    public async Task<IActionResult> OnPostAsync() {
        if (!ModelState.IsValid) return Page();
        var user = await users.FindByNameAsync(Username.Trim());
        // Check the password even for a disabled account to keep the public error generic.
        var result = user is null ? Microsoft.AspNetCore.Identity.SignInResult.Failed
            : await signIn.CheckPasswordSignInAsync(user, Password, lockoutOnFailure: true);
        if (result.Succeeded && user!.Enabled) {
            await signIn.SignInAsync(user, isPersistent: false);
            return LocalRedirect(Url.IsLocalUrl(ReturnUrl) ? ReturnUrl! : Url.Page("/Index")!);
        }
        ModelState.AddModelError("", "Tidak bisa masuk. Periksa nama pengguna dan password. Jika berulang, tunggu 15 menit atau hubungi admin.");
        return Page();
    }
}
