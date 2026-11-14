using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using ScanInbox.Data;

namespace ScanInbox.Pages;
public sealed class AccountModel(UserManager<AppUser> users, SignInManager<AppUser> signIn) : PageModel {
    [BindProperty, Required] public string CurrentPassword { get; set; } = "";
    [BindProperty, Required, MinLength(12)] public string NewPassword { get; set; } = "";
    [BindProperty, Compare(nameof(NewPassword), ErrorMessage = "Pengulangan password tidak sama.")] public string ConfirmPassword { get; set; } = "";
    public bool Success { get; set; }
    public async Task<IActionResult> OnPostAsync() {
        if (!ModelState.IsValid) return Page();
        var user = await users.GetUserAsync(User);
        if (user is null) return Challenge();
        var result = await users.ChangePasswordAsync(user, CurrentPassword, NewPassword);
        if (!result.Succeeded) {
            foreach (var error in result.Errors) ModelState.AddModelError("", error.Description);
            return Page();
        }
        await signIn.RefreshSignInAsync(user);
        ModelState.Clear();
        CurrentPassword = NewPassword = ConfirmPassword = "";
        Success = true;
        return Page();
    }
}
