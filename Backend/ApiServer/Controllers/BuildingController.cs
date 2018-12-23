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
    public class BuildingController : GameAPIController
    {
        private ILog logger = LogManager.GetLogger(typeof(BuildingController));

        // POST api/v1/building/build
        /// <summary>
        /// build building on tile
        /// </summary>
        /// <returns></returns>
        /// TODO: refactor this long method
        [HttpPost("build/")]
        [Authorize]
        public IActionResult PostBuild([FromBody]BuildBuildingModel build)
        {
            UserModel user = getCurretUser();
            
            BuildingQueue queueEntry = BuildBuilding(build, user);
            return (queueEntry == null) ? (IActionResult)BadRequest() : Ok(queueEntry);
        }

        public BuildingQueue BuildBuilding(BuildBuildingModel build, UserModel user)
        {
            IslandRepository islandRepository = new IslandRepository();
            Tile tile = islandRepository.getTile(build.Tile.Position.X, build.Tile.Position.Y, build.Tile.Position.Z);

            if (tile == null)
            {
                // TODO: report user
                logger.Warn("no valid tile - probably a user faked this request -> report to bot detector");
                return null;
            }

            // TODO: compute level to be built

            // try to get tech for requested building
            var techs = BuildTechController.Instance.GetBuildTech();
            var buildingToBeBuilt = techs.FirstOrDefault(b =>
                b.GetType().ToString().Split('.').Last() == build.BuildingName && b.Level == build.Level);

            if (buildingToBeBuilt == null)
            {
                // TODO: report user
                logger.Warn(
                    "no valid building found in tech tree - probably a user faked this request -> report to bot detector");
                return null;
            }

            // check if requirements are fulfilled
            {
                // TODO: user has enough resources


                // tile is allowed here
                if (buildingToBeBuilt.allowedTiles.All(t => t.type != tile.type))
                {
                    // TODO: report user
                    logger.Warn("no tile for building - probably a user faked this request -> report to bot detector");
                    return null;
                }

                // if there is a building check if its the same, check if level is correct (if empty level 1, if existing +1)
                if (tile.Building == null && build.Level != 1)
                {
                    // TODO: report user
                    logger.Warn("wrong level for new building - probably a user faked this request -> report to bot detector");
                    return null;
                }

                if (tile.Building != null)
                {
                    // check if same building
                    if (tile.Building.type != buildingToBeBuilt.type)
                    {
                        // TODO: report user
                        logger.Warn(
                            "change of building on tile - probably a user faked this request -> report to bot detector");
                        return null;
                    }

                    if (tile.Building.Level + 1 != build.Level)
                    {
                        // TODO: report user
                        logger.Warn(
                            "wrong level for existing building - probably a user faked this request -> report to bot detector");
                        return null;
                    }
                }

                // TODO: needed tile tech is researched
            }

            // clean building
            buildingToBeBuilt = buildingToBeBuilt.CleanTechData();

            // set building on tile
            tile.Building = buildingToBeBuilt;
            islandRepository.ReplaceTile(tile);

            // add entry to queue
            BuildingQueue queueEntry = new BuildingQueue();
            queueEntry.Tile = tile;
            queueEntry.Building = buildingToBeBuilt;
            queueEntry.Owner = user;
            queueEntry.StartTime = DateTime.Now;

            QueueRepository queueRepository = new QueueRepository();
            queueRepository.Add(queueEntry);

            return queueEntry;
        }
    }
}
