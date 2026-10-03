using Bjarnoy.Api.Auth.ApiKeys;

namespace Bjarnoy.Api.IntegrationTests.ApiKeys;

public sealed class ApiKeyTokenTests
{
    [Fact]
    public void A_generated_token_has_the_documented_shape_and_parses_back()
    {
        var (keyId, secret, token) = ApiKeyToken.Generate();

        Assert.Matches("^[0-9a-f]{16}$", keyId);
        Assert.Matches("^[A-Za-z0-9_-]{43}$", secret); // base64url of 32 bytes, unpadded
        Assert.Equal($"bjk_{keyId}_{secret}", token);

        Assert.True(ApiKeyToken.TryParse(token, out var parsedId, out var parsedSecret));
        Assert.Equal(keyId, parsedId);
        Assert.Equal(secret, parsedSecret);
        Assert.Equal($"bjk_{keyId}_…", ApiKeyToken.Hint(keyId));
    }

    [Fact]
    public void Tokens_are_unique()
    {
        var tokens = Enumerable.Range(0, 50).Select(_ => ApiKeyToken.Generate().Token).ToHashSet();
        Assert.Equal(50, tokens.Count);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("bjk_")]
    [InlineData("eyJhbGciOi.jwt.like")]
    [InlineData("bjk_0123456789abcde_secret")]
    [InlineData("bjk_0123456789ABCDEF_secret")]
    [InlineData("bjk_0123456789abcdef")]
    [InlineData("bjk_0123456789abcdef_")]
    public void Anything_not_shaped_like_a_token_does_not_parse(string? token) =>
        Assert.False(ApiKeyToken.TryParse(token, out _, out _));

    [Fact]
    public void Only_the_matching_secret_verifies_against_its_hash()
    {
        var (_, secret, _) = ApiKeyToken.Generate();
        var hash = ApiKeyToken.HashSecret(secret);

        Assert.Equal(64, hash.Length);
        Assert.True(ApiKeyToken.Verify(secret, hash));
        Assert.False(ApiKeyToken.Verify(secret + "x", hash));
        Assert.False(ApiKeyToken.Verify(ApiKeyToken.GenerateSecret(), hash));
    }
}
