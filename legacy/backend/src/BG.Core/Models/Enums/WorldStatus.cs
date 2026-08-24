using System.ComponentModel;

namespace BG.Core.Models.Enums;

public enum WorldStatus
{
    Active, // world is running and accepting new players
    Maintenance, // world is paused or maintenance
    Full, // world has reached max player limit

    [Description("game over")]
    Ended // world has ended and no longer accepting new players
}