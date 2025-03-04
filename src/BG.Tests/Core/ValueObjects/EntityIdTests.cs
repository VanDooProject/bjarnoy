using BG.Core.ValueObjects;

namespace BG.Tests.Core.ValueObjects;

[TestFixture]
public class EntityIdTests
{
    [Test]
    public void NewId_ShouldCreateGuidV7()
    {
        // Act
        var id = EntityId.NewId();

        // Assert
        var guid = id.ToGuid();
        Assert.That(guid.Version, Is.EqualTo(7));
    }

    [Test]
    public void FromGuid_ShouldCreateValidId()
    {
        // Arrange
        var guid = Guid.NewGuid();

        // Act
        var id = EntityId.FromGuid(guid);

        // Assert
        Assert.That(id.ToGuid(), Is.EqualTo(guid));
    }

    [Test]
    public void Constructor_WithInvalidByteArray_ShouldThrow()
    {
        // Arrange
        var invalidBytes = new byte[8];

        // Act & Assert
        Assert.Throws<ArgumentException>(() => new EntityId(invalidBytes));
    }

    [Test]
    public void Constructor_WithNullByteArray_ShouldThrow()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => new EntityId(null!));
    }

    [Test]
    public void EqualityOperator_ShouldWorkCorrectly()
    {
        // Arrange
        var guid = Guid.NewGuid();
        var id1 = EntityId.FromGuid(guid);
        var id2 = EntityId.FromGuid(guid);
        var id3 = EntityId.NewId();

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(id1 == id2, Is.True);
            Assert.That(id1 != id3, Is.True);
            Assert.That(id1.Equals(id2), Is.True);
            Assert.That(id1.Equals(id3), Is.False);
        });
    }

    [Test]
    public void GetHashCode_ShouldBeConsistentWithEquals()
    {
        // Arrange
        var guid = Guid.NewGuid();
        var id1 = EntityId.FromGuid(guid);
        var id2 = EntityId.FromGuid(guid);

        // Assert
        Assert.That(id1.GetHashCode(), Is.EqualTo(id2.GetHashCode()));
    }
}