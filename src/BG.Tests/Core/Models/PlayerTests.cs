using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Tests.Core.Models;

[TestFixture]
public class PlayerTests
{
    private EntityId _userId;
    private EntityId _worldId;
    private string _playerName;

    [SetUp]
    public void Setup()
    {
        _userId = EntityId.NewId();
        _worldId = EntityId.NewId();
        _playerName = "TestPlayer";
    }

    [Test]
    public void Create_ShouldInitializeCorrectly()
    {
        // Act
        var player = Player.Create(_userId, _worldId, _playerName);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(player.UserId, Is.EqualTo(_userId));
            Assert.That(player.WorldId, Is.EqualTo(_worldId));
            Assert.That(player.Name, Is.EqualTo(_playerName));
            Assert.That(player.IsActive, Is.True);
            Assert.That(player.DelegatedToUserId, Is.Null);
            Assert.That(player.DelegationExpiresAt, Is.Null);
            Assert.That(player.JoinedAt.Date, Is.EqualTo(DateTime.UtcNow.Date));
        });
    }

    [Test]
    public void DelegateTo_ShouldSetDelegation()
    {
        // Arrange
        var player = Player.Create(_userId, _worldId, _playerName);
        var delegateId = EntityId.NewId();
        var expiresAt = DateTime.UtcNow.AddDays(1);

        // Act
        player.DelegateTo(delegateId, expiresAt);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(player.DelegatedToUserId, Is.EqualTo(delegateId));
            Assert.That(player.DelegationExpiresAt, Is.EqualTo(expiresAt));
        });
    }

    [Test]
    public void RevokeDelegation_ShouldClearDelegation()
    {
        // Arrange
        var player = Player.Create(_userId, _worldId, _playerName);
        player.DelegateTo(EntityId.NewId(), DateTime.UtcNow.AddDays(1));

        // Act
        player.RevokeDelegation();

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(player.DelegatedToUserId, Is.Null);
            Assert.That(player.DelegationExpiresAt, Is.Null);
        });
    }

    [Test]
    public void UpdateActive_ShouldChangeActiveStatus()
    {
        // Arrange
        var player = Player.Create(_userId, _worldId, _playerName);

        // Act
        player.UpdateActive(false);

        // Assert
        Assert.That(player.IsActive, Is.False);
    }

    [Test]
    public void IsDelegatedTo_WhenActive_ShouldReturnTrue()
    {
        // Arrange
        var player = Player.Create(_userId, _worldId, _playerName);
        var delegateId = EntityId.NewId();
        player.DelegateTo(delegateId, DateTime.UtcNow.AddDays(1));

        // Assert
        Assert.That(player.IsDelegatedTo(delegateId), Is.True);
    }

    [Test]
    public void IsDelegatedTo_WhenExpired_ShouldReturnFalse()
    {
        // Arrange
        var player = Player.Create(_userId, _worldId, _playerName);
        var delegateId = EntityId.NewId();
        player.DelegateTo(delegateId, DateTime.UtcNow.AddSeconds(-1));

        // Assert
        Assert.That(player.IsDelegatedTo(delegateId), Is.False);
    }

    [Test]
    public void IsDelegatedTo_WithDifferentUser_ShouldReturnFalse()
    {
        // Arrange
        var player = Player.Create(_userId, _worldId, _playerName);
        player.DelegateTo(EntityId.NewId(), DateTime.UtcNow.AddDays(1));

        // Assert
        Assert.That(player.IsDelegatedTo(EntityId.NewId()), Is.False);
    }
}