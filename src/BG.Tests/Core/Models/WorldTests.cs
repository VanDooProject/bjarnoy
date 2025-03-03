using BG.Core.Models;
using BG.Core.Models.Enums;

namespace BG.Tests.Core.Models;

[TestFixture]
public class WorldTests
{
    [Test]
    public void Create_ShouldInitializeCorrectly()
    {
        // Arrange
        var name = "Test World";
        var maxPlayers = 100;

        // Act
        var world = World.Create(name, maxPlayers);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(world.Name, Is.EqualTo(name));
            Assert.That(world.MaxPlayers, Is.EqualTo(maxPlayers));
            Assert.That(world.Status, Is.EqualTo(WorldStatus.Active));
            Assert.That(world.CreatedAt.Date, Is.EqualTo(DateTime.UtcNow.Date));
        });
    }

    [Test]
    public void UpdateStatus_ShouldChangeWorldStatus()
    {
        // Arrange
        var world = World.Create("Test", 100);

        // Act
        world.UpdateStatus(WorldStatus.Full);

        // Assert
        Assert.That(world.Status, Is.EqualTo(WorldStatus.Full));
    }

    [Test]
    public void CanJoin_WhenActive_ShouldReturnTrue()
    {
        // Arrange
        var world = World.Create("Test", 100);

        // Assert
        Assert.That(world.CanJoin(), Is.True);
    }

    [TestCase(WorldStatus.Maintenance)]
    [TestCase(WorldStatus.Full)]
    [TestCase(WorldStatus.Ended)]
    public void CanJoin_WhenNotActive_ShouldReturnFalse(WorldStatus status)
    {
        // Arrange
        var world = World.Create("Test", 100);
        world.UpdateStatus(status);

        // Assert
        Assert.That(world.CanJoin(), Is.False);
    }
}