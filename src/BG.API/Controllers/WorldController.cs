using BG.API.Models.Auth;
using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.ValueObjects;
using BG.Core.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace BG.API.Controllers;

[ApiController]
[Route("api/v1/worlds")]
public class WorldController : ControllerBase
{
    private readonly IWorldRepository _worldRepository;
    private readonly IPlayerRepository _playerRepository;
    private readonly IUserRepository _userRepository;
    private readonly ITokenService _tokenService;

    public WorldController(
        IWorldRepository worldRepository,
        IPlayerRepository playerRepository,
        IUserRepository userRepository,
        ITokenService tokenService)
    {
        _worldRepository = worldRepository;
        _playerRepository = playerRepository;
        _userRepository = userRepository;
        _tokenService = tokenService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<World>), StatusCodes.Status200OK)]
    public async Task<Ok<IEnumerable<World>>> GetWorlds()
    {
        var worlds = await _worldRepository.GetAllAsync();
        return TypedResults.Ok(worlds);
    }

    [Authorize(Roles = "admin")]
    [HttpPost]
    [ProducesResponseType(typeof(World), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<Results<Created<World>, BadRequest<ErrorResponse>>> CreateWorld(
        [FromBody] CreateWorldRequest request)
    {
        var world = new World(EntityId.NewId(), request.Name, request.MaxPlayers);
        await _worldRepository.CreateAsync(world);

        return TypedResults.Created($"/api/v1/worlds/{world.Id}", world);
    }

    [Authorize]
    [HttpPost("{worldId}/join")]
    [ProducesResponseType(typeof(Player), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<Results<Ok<Player>, NotFound, BadRequest<ErrorResponse>>> JoinWorld(
        EntityId worldId,
        [FromBody] JoinWorldRequest request)
    {
        var world = await _worldRepository.GetByIdAsync(worldId);
        if (world == null)
        {
            return TypedResults.NotFound();
        }

        if (world.IsFull())
        {
            return TypedResults.BadRequest(new ErrorResponse("World is full"));
        }

        var userIdString = _tokenService.GetUserIdFromClaims(User.Claims);
        if (userIdString == null || !EntityId.TryParse(userIdString, out var userId))
        {
            return TypedResults.BadRequest(new ErrorResponse("Invalid user ID"));
        }

        var existingPlayer = await _playerRepository.GetByUserAndWorldAsync(userId, worldId);
        if (existingPlayer != null)
        {
            return TypedResults.BadRequest(new ErrorResponse("Already joined this world"));
        }

        var player = Player.Create(userId, worldId, request.PlayerName);
        await _playerRepository.CreateAsync(player);

        return TypedResults.Ok(player);
    }
}

public record CreateWorldRequest(string Name, int MaxPlayers);
public record JoinWorldRequest(string PlayerName);