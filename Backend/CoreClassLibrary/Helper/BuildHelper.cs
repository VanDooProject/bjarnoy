using System;
using System.Diagnostics;
using System.Linq;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Exceptions;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.Technologies;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;

namespace CoreClassLibrary.Helper
{
    public class BuildHelper
    {
        private ILog logger = LogManager.GetLogger(typeof(BuildHelper));

        private readonly IIslandRepository _islandRepository = new IslandRepository();
        private readonly IPlayerRepository _playerRepository = new PlayerRepository();

        public BuildHelper()
        {
        }

        public BuildHelper(IIslandRepository islandRepository, IPlayerRepository playerRepository)
        {
            this._islandRepository = islandRepository;
            this._playerRepository = playerRepository;
        }

        /// <summary>
        /// helper to create build queue entries
        ///  * checks all requirements
        ///  * saves building to tile
        ///  * takes resources from given user
        ///  * generates queue entry
        /// </summary>
        /// <param name="requestedBuilding"></param>
        /// <param name="player"></param>
        /// <returns></returns>
        public BuildingQueue BuildBuilding(BuildBuildingModel requestedBuilding, Player player)
        {
            try
            {
                Tile tile = _islandRepository.getTile(requestedBuilding.Position.X, requestedBuilding.Position.Y, requestedBuilding.Position.Z);

                // TODO: compute level to be built
                // level is checked in - checkBuildingRequirements()

                // try to get tech for requested building
                BuildTechnology buildTech = findTech(requestedBuilding);

                // check ownership
                this.checkOwnership(tile, player);

                // check if requirements are fulfilled
                checkBuildingResources(player, buildTech);
                checkBuildingRequirements(tile, buildTech);

                // remove resources from user - think of race conditions
                player.EntityResources.SubtractResources(buildTech.ResourcesNeeded);
                // this throws an exception when there is a race condition -> do this first so all other operations which would change DB fail here
                _playerRepository.ReplaceAwareOfResources(player);


                // clean building
                Building buildingToBeBuilt = buildTech.Building; // <- TODO deep copy / clone

                // set building on tile
                buildingToBeBuilt.Level--;
                tile.Building = buildingToBeBuilt;
                _islandRepository.ReplaceTile(tile);
                buildingToBeBuilt.Level++;

                // add entry to queue
                BuildingQueue queueEntry = new BuildingQueue();
                queueEntry.Tile = tile;
                queueEntry.Building = buildingToBeBuilt;
                queueEntry.Owner = player;
                queueEntry.StartTime = Time.Now;

                // test this since it can be null TODO refactor
                if (buildTech.ResearchDuration != null)
                {
                    queueEntry.EndTime = Time.Now + (TimeSpan)buildTech.ResearchDuration;
                }
                else
                {
                    throw new Exception($"build tech is faulty - missing duration: {buildTech}");
                }

                // TODO refactor -> remove this out of the helper & rename helper
                //_queueRepository.Add(queueEntry);

                return queueEntry;
            }
            catch (IllegalTileException e)
            {
                logger.Warn("no valid tile - probably a user faked this request -> report to bot detector");
                throw new GameException("no valid tile", e);
            }
        }

        private void checkOwnership(Tile tile, Player player)
        {
            if (tile.Owner._id != player._id)
            {
                logger.Warn("player does not own this tile - probably a user faked this request -> report to bot detector");
                throw new BuildBuildingException("player does not own this tile");
            }
        }

        private BuildTechnology findTech(BuildBuildingModel build)
        {
            var buildTech = BuildTechController.Instance.findTech(build.BuildingName, build.Level);

            return buildTech;
        }

        private void checkBuildingResources(Player player, BuildTechnology buildTech)
        {
            // check if user has enough resources
            if (player.EntityResources.ResourcesStoredCurrently < buildTech.ResourcesNeeded)
            {
                throw new BuildBuildingException("user has not enough resources to build");
            }
        }

        private void checkBuildingRequirements(Tile tile, BuildTechnology buildTech)
        {
            if (tile == null)
            {
                throw new ArgumentNullException("tile not set");
            }


            // tile is allowed here
            if (buildTech.AllowedTiles != null && buildTech.AllowedTiles.All(t => t.type != tile.type))
            {
                // TODO: report user
                logger.Warn("no tile for building - probably a user faked this request -> report to bot detector");
                throw new BuildBuildingException("tile not allowed");
            }

            // if there is a building check if its the same, check if level is correct (if empty level 1, if existing +1)
            if (tile.Building == null && buildTech.Building.Level != 1)
            {
                // TODO: report user
                logger.Warn("wrong level for new building - probably a user faked this request -> report to bot detector");
                throw new BuildBuildingException("wrong level for new building");
            }

            if (tile.Building != null)
            {
                // check if same building
                if (tile.Building.type != buildTech.Building.type)
                {
                    // TODO: report user
                    logger.Warn("change of building on tile - probably a user faked this request -> report to bot detector");
                    throw new BuildBuildingException("change of building on tile");
                }

                if (tile.Building.Level + 1 != buildTech.Building.Level)
                {
                    // TODO: report user
                    logger.Warn("wrong level for existing building - probably a user faked this request -> report to bot detector");
                    throw new BuildBuildingException("wrong level for existing building");
                }
            }

            // TODO: check if needed tile tech is researched
        }
    }
}