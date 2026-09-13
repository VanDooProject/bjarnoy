namespace Bjarnoy.Api.Contracts;

/// <summary>
/// What is actually running here — the answer to "is this deployment on the
/// commit I just pushed?", which several branch deployments side by side make a
/// real question. Fields read <c>"unknown"</c> when the build did not stamp them.
/// </summary>
public sealed record BuildInfoResponse(
    string Version,
    string Commit,
    string ShortCommit,
    string Branch,
    string BuiltAt,
    string Environment);
