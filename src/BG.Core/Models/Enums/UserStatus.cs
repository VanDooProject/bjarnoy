namespace BG.Core.Models.Enums;

public enum UserStatus
{
    Active, // default status
    Unconfirmed, // when email is not confirmed yet
    Banned, // when banned by admin
    Locked, // after to many failed login attempts
    Inactive, // when not logged in for a long time
}