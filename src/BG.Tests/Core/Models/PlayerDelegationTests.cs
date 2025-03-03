using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Tests.Core.Models;

[TestFixture]
public class PlayerDelegationTests
{
    private EntityId _playerId;
    private EntityId _delegateId;
    private string[] _permissions;
    private DateTime _expiresAt;

    [SetUp]
    public void Setup()
    {
        _playerId = EntityId.NewId();
        _delegateId = EntityId.NewId();
        _permissions = new[] { "view", "manage_buildings" };
        _expiresAt = DateTime.UtcNow.AddDays(7);
    }

    [Test]
    public void Create_ShouldInitializeCorrectly()
    {
        // Act
        var delegation = PlayerDelegation.Create(
            _playerId,
            _delegateId,
            _expiresAt,
            _permissions);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(delegation.PlayerId, Is.EqualTo(_playerId));
            Assert.That(delegation.DelegatedToUserId, Is.EqualTo(_delegateId));
            Assert.That(delegation.ExpiresAt, Is.EqualTo(_expiresAt));
            Assert.That(delegation.Permissions, Is.EqualTo(_permissions));
            Assert.That(delegation.CreatedAt.Date, Is.EqualTo(DateTime.UtcNow.Date));
        });
    }

    [Test]
    public void IsExpired_WhenNotExpired_ShouldReturnFalse()
    {
        // Arrange
        var delegation = PlayerDelegation.Create(
            _playerId,
            _delegateId,
            DateTime.UtcNow.AddDays(1),
            _permissions);

        // Assert
        Assert.That(delegation.IsExpired(), Is.False);
    }

    [Test]
    public void IsExpired_WhenExpired_ShouldReturnTrue()
    {
        // Arrange
        var delegation = PlayerDelegation.Create(
            _playerId,
            _delegateId,
            DateTime.UtcNow.AddDays(-1),
            _permissions);

        // Assert
        Assert.That(delegation.IsExpired(), Is.True);
    }

    [Test]
    public void HasPermission_WhenPermissionExists_ShouldReturnTrue()
    {
        // Arrange
        var delegation = PlayerDelegation.Create(
            _playerId,
            _delegateId,
            _expiresAt,
            _permissions);

        // Assert
        Assert.That(delegation.HasPermission("view"), Is.True);
    }

    [Test]
    public void HasPermission_WhenPermissionDoesNotExist_ShouldReturnFalse()
    {
        // Arrange
        var delegation = PlayerDelegation.Create(
            _playerId,
            _delegateId,
            _expiresAt,
            _permissions);

        // Assert
        Assert.That(delegation.HasPermission("invalid"), Is.False);
    }
}