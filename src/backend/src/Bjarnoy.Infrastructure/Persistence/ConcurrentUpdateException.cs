namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// A request kept losing a write race and gave up: it was re-run
/// <see cref="Attempts"/> times against fresh state and a concurrent writer
/// changed the same settlement each time (issue #341).
/// </summary>
/// <remarks>
/// The API maps this to 409; the caller can simply retry.
/// </remarks>
public sealed class ConcurrentUpdateException(int attempts, Exception innerException)
    : Exception($"The update conflicted with concurrent changes after {attempts} attempts.", innerException)
{
    /// <summary>How many times the request was run before giving up.</summary>
    public int Attempts { get; } = attempts;
}
