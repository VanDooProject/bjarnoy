using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Core.Interfaces.Repositories;

public interface IEmailVerificationRepository
{
    Task<EmailVerification?> GetVerificationByTokenAsync(string token);
    Task<IEnumerable<EmailVerification>> GetVerificationsByUserIdAsync(EntityId userId);
    Task CreateAsync(EmailVerification verification);
    Task DeleteAsync(EntityId verificationId);
}