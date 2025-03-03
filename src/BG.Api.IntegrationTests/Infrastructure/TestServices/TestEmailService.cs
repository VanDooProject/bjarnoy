using BG.Core.Models;
using BG.Core.Services;

namespace BG.Api.IntegrationTests.Infrastructure.TestServices;

public class TestEmailService : IEmailService
{
    private readonly List<(User User, string Token)> _verificationEmails = new();
    private readonly List<(User User, string Token)> _resetEmails = new();

    public Task SendVerificationEmailAsync(User user, EmailVerification verification)
    {
        _verificationEmails.Add((user, verification.Token));
        return Task.CompletedTask;
    }

    public Task SendPasswordResetEmailAsync(User user, string resetToken)
    {
        _resetEmails.Add((user, resetToken));
        return Task.CompletedTask;
    }

    public string? GetLastVerificationToken(string email)
    {
        return _verificationEmails
            .LastOrDefault(e => e.User.Email == email)
            .Token;
    }

    public string? GetLastResetToken(string email)
    {
        return _resetEmails
            .LastOrDefault(e => e.User.Email == email)
            .Token;
    }

    public void Clear()
    {
        _verificationEmails.Clear();
        _resetEmails.Clear();
    }
}