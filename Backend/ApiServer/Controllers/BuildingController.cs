using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Numerics;
using System.Security.Claims;
using System.Threading.Tasks;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    [ApiController]
    public class BuildingController : ControllerBase
    {
        private ILog logger = LogManager.GetLogger(typeof(BuildingController));

        // POST api/v1/building/build
        /// <summary>
        /// build building on tile
        /// </summary>
        /// <returns></returns>
        [HttpPost("build/")]
        [Authorize]
        public IActionResult PostBuild([FromBody]BuildBuildingModel build)
        {
            IslandRepository islandRepository = new IslandRepository();
            Tile tile = islandRepository.getTile(build.Tile.Position.X, build.Tile.Position.Y, build.Tile.Position.Z);

            if (tile == null)
            {
                // TODO: report user
                logger.Warn("probably a user faked this request -> report to bot detector");
                return base.BadRequest("no valid tile");
            }

            // try to get tech for requested building
            var techs = BuildTechController.Instance.GetBuildTech();
            var thisTech = techs.FirstOrDefault(b =>
                {
                    return b.GetType().ToString().Split('.').Last() == build.BuildingName && b.Level == build.Level;
                });

            UserRepository userRepository = new UserRepository();
            UserModel user = userRepository.GetByUserId(HttpContext.User.FindFirst(c => c.Type == ClaimTypes.NameIdentifier).Value);
            // we have a problem with tokens when this triggers
            Debug.Assert(user != null);

            // check if requirements are fulfilled
                // user has enough resources
                // tile is allowed here
                // needed tile tech is researched

            // set building on tile

            // add entry to queue
            var queueEntry = new BuildingQueue();
            queueEntry.Tile = tile;
            queueEntry.Building = thisTech.CleanTechData(); // TODO reduce data (no requirements and no allowed Tiles and no ResourcesNeeded)
            // TODO add user ref
            queueEntry.StartTime = DateTime.Now;

            return Ok(queueEntry);
        }
    }
}
