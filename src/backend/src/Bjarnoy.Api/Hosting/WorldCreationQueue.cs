using System.Threading.Channels;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// The worlds waiting to be generated, handed from the admin endpoint (which answers at once) to
/// <see cref="WorldCreationHostedService"/>. In memory only: a restart drops the queue, and the worlds it held are
/// marked failed on the next start (<see cref="Bjarnoy.Infrastructure.Services.WorldService.FailInterruptedWorldCreationsAsync"/>).
/// </summary>
public sealed class WorldCreationQueue
{
    /// <summary>A world to generate; <paramref name="AutoSeed"/> is true when its seed was drawn at random.</summary>
    public readonly record struct Request(Guid WorldId, bool AutoSeed);

    private readonly Channel<Request> _channel = Channel.CreateUnbounded<Request>(
        new UnboundedChannelOptions { SingleReader = true });

    public ChannelReader<Request> Reader => _channel.Reader;

    public void Enqueue(Guid worldId, bool autoSeed) => _channel.Writer.TryWrite(new Request(worldId, autoSeed));
}
