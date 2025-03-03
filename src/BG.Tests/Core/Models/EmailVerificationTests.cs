using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Tests.Core.Models;

[TestFixture]
public class EmailVerificationTests
{
    private EntityId _userId;
    private string _email;
    private TimeSpan _validityPeriod;

    [SetUp]
    public void Setup()
    {
        _userId = EntityId.NewId();
        _email = "test@example.com";
        _validityPeriod = TimeSpan.FromHours(24);
    }

    [Test]
    public void Create_ShouldInitializeCorrectly()
    {
        // Act
        var verification = EmailVerification.Create(_userId, _email, _validityPeriod);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(verification.UserId, Is.EqualTo(_userId));
            Assert.That(verification.Email, Is.EqualTo(_email));
            Assert.That(verification.Token, Is.Not.Empty);
            Assert.That(verification.ExpiresAt, Is.GreaterThan(DateTime.UtcNow));
            Assert.That(verification.CreatedAt.Date, Is.EqualTo(DateTime.UtcNow.Date));
        });
    }

    [Test]
    public void IsExpired_WhenNotExpired_ShouldReturnFalse()
    {
        // Arrange
        var verification = EmailVerification.Create(
            _userId,
            _email,
            TimeSpan.FromDays(1));

        // Assert
        Assert.That(verification.IsExpired(), Is.False);
    }

    [Test]
    public void IsExpired_WhenExpired_ShouldReturnTrue()
    {
        // Arrange
        var verification = EmailVerification.Create(
            _userId,
            _email,
            TimeSpan.FromSeconds(-1));

        // Assert
        Assert.That(verification.IsExpired(), Is.True);
    }

    [Test]
    public void IsValid_WithCorrectToken_AndNotExpired_ShouldReturnTrue()
    {
        // Arrange
        var verification = EmailVerification.Create(
            _userId,
            _email,
            _validityPeriod);

        // Assert
        Assert.That(verification.IsValid(verification.Token), Is.True);
    }

    [Test]
    public void IsValid_WithWrongToken_ShouldReturnFalse()
    {
        // Arrange
        var verification = EmailVerification.Create(
            _userId,
            _email,
            _validityPeriod);

        // Assert
        Assert.That(verification.IsValid("wrong-token"), Is.False);
    }

    [Test]
    public void IsValid_WhenExpired_ShouldReturnFalse()
    {
        // Arrange
        var verification = EmailVerification.Create(
            _userId,
            _email,
            TimeSpan.FromSeconds(-1));

        // Act & Assert
        Assert.That(verification.IsValid(verification.Token), Is.False);
    }
}