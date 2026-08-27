using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>
/// One migrated SQLite-backed application, shared by the tests in a class.
/// </summary>
public sealed class SqliteApiFixture : IAsyncLifetime
{
    public BjarnoyApiFactory Factory { get; } = BjarnoyApiFactory.Sqlite();

    /// <summary>
    /// Strict deserialisation: an unexpected property in a response fails the
    /// test rather than being quietly dropped, so a contract change cannot pass
    /// unnoticed.
    /// </summary>
    public static JsonSerializerOptions StrictJson { get; } = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public HttpClient CreateClient() => Factory.CreateClient();

    public async ValueTask InitializeAsync() => await Factory.MigrateAsync(TestContext.Current.CancellationToken);

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }
}

public static class HttpResponseExtensions
{
    /// <summary>
    /// Reads a JSON body strictly, and surfaces the raw body in the failure
    /// message when it does not match — otherwise a contract mismatch shows up
    /// only as a null.
    /// </summary>
    public static async Task<T> ReadStrictAsync<T>(
        this HttpResponseMessage response,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(response);

        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        try
        {
            return JsonSerializer.Deserialize<T>(body, SqliteApiFixture.StrictJson)
                ?? throw new JsonException($"Body deserialised to null: {body}");
        }
        catch (JsonException ex)
        {
            throw new JsonException(
                $"Could not read a {typeof(T).Name} from {(int)response.StatusCode} body: {body}", ex);
        }
    }

    /// <summary>
    /// Reads the machine-readable rejection reason off a founding failure's
    /// ProblemDetails (see SettlementEndpoints.Problem) — the field the
    /// frontend actually branches on, since several distinct rejections
    /// share the same 409 status.
    /// </summary>
    public static async Task<string?> RejectionAsync(
        this HttpResponseMessage response,
        CancellationToken cancellationToken = default)
    {
        var problem = await response.ReadStrictAsync<ProblemDetails>(cancellationToken);
        return problem.Extensions.TryGetValue("rejection", out var value) && value is JsonElement element
            ? element.GetString()
            : null;
    }

    public static Task<HttpResponseMessage> PostJsonAsync<T>(
        this HttpClient client,
        string url,
        T value,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(client);

        return client.PostAsJsonAsync(url, value, SqliteApiFixture.StrictJson, cancellationToken);
    }
}
