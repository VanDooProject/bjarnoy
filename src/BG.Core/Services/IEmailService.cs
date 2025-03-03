using BG.Core.Models;

namespace BG.Core.Services;

public interface IEmailService
{
    Task SendVerificationEmailAsync(User user, EmailVerification verification);
    Task SendPasswordResetEmailAsync(User user, string resetToken);
}