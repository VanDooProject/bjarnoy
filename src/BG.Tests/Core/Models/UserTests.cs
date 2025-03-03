using BG.Core.Models;
using BG.Core.Models.Enums;
using BG.Core.ValueObjects;

namespace BG.Tests.Core.Models;

[TestFixture]
public class UserTests
{
    [Test]
    public void Create_ShouldInitializeCorrectly()
    {
        // Arrange
        var username = "testuser";
        var email = "test@example.com";
        var passwordHash = "hashedpassword";

        // Act
        var user = User.Create(username, email, passwordHash);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(user.Username, Is.EqualTo(username));
            Assert.That(user.Email, Is.EqualTo(email));
            Assert.That(user.PasswordHash, Is.EqualTo(passwordHash));
            Assert.That(user.Status, Is.EqualTo(UserStatus.Active));
            Assert.That(user.Roles, Is.Empty);
            Assert.That(user.LastLoginAt, Is.Null);
            Assert.That(user.CreatedAt.Date, Is.EqualTo(DateTime.UtcNow.Date));
        });
    }

    [Test]
    public void UpdateLogin_ShouldUpdateLastLoginTime()
    {
        // Arrange
        var user = User.Create("testuser", "test@example.com", "hash");
        var beforeUpdate = DateTime.UtcNow;

        // Act
        user.UpdateLastOnline();

        // Assert
        Assert.That(user.LastLoginAt, Is.Not.Null);
        Assert.That(user.LastLoginAt!.Value, Is.GreaterThanOrEqualTo(beforeUpdate));
    }

    [Test]
    public void UpdateStatus_ShouldChangeUserStatus()
    {
        // Arrange
        var user = User.Create("testuser", "test@example.com", "hash");

        // Act
        user.UpdateStatus(UserStatus.Locked);

        // Assert
        Assert.That(user.Status, Is.EqualTo(UserStatus.Locked));
    }

    [Test]
    public void UpdateRoles_ShouldSetNewRoles()
    {
        // Arrange
        var user = User.Create("testuser", "test@example.com", "hash");
        var roles = new[] { "admin", "moderator" };

        // Act
        user.UpdateRoles(roles);

        // Assert
        Assert.That(user.Roles, Is.EqualTo(roles));
    }

    [Test]
    public void HasRole_ShouldCheckRoleCorrectly()
    {
        // Arrange
        var user = User.Create("testuser", "test@example.com", "hash");
        user.UpdateRoles(new[] { "admin", "moderator" });

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(user.HasRole("admin"), Is.True);
            Assert.That(user.HasRole("moderator"), Is.True);
            Assert.That(user.HasRole("user"), Is.False);
        });
    }
}