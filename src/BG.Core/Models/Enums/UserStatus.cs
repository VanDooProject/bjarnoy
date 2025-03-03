namespace BG.Core.Models.Enums;

public enum UserStatus
{
    Active, // default status
    Inactive, // when not logged in for a long time
    Banned, // when banned by admin
    Locked // after to many failed login attempts
}