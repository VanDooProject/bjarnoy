using System;
using System.Linq;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;

namespace CoreClassLibrary.Helper
{
    public class BuildHelper
    {
        private ILog logger = LogManager.GetLogger(typeof(BuildHelper));

        public BuildHelper()
        {
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
                logger.Warn("no valid building found in tech tree - probably a user faked this request -> report to bot detector");
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
                        logger.Warn("wrong level for existing building - probably a user faked this request -> report to bot detector");
                        return null;
                    }
                }

                // TODO: needed tile tech is researched
            }

            // clean building
            buildingToBeBuilt = buildingToBeBuilt.CleanTechData();

            // set building on tile
            buildingToBeBuilt.Level--;
            tile.Building = buildingToBeBuilt;
            islandRepository.ReplaceTile(tile);
            buildingToBeBuilt.Level++;

            // add entry to queue
            BuildingQueue queueEntry = new BuildingQueue();
            queueEntry.Tile = tile;
            queueEntry.Building = buildingToBeBuilt;
            queueEntry.Owner = user;
            queueEntry.StartTime = DateTime.Now;

            // test this since it can be null
            if (buildingToBeBuilt.BuildDuration != null)
            {
                queueEntry.EndTime = DateTime.Now + (TimeSpan) buildingToBeBuilt.BuildDuration;
            }
            else
            {
                throw new Exception($"build tech is faulty - missing duration: {buildingToBeBuilt}");
            }

            QueueRepository queueRepository = new QueueRepository();
            queueRepository.Add(queueEntry);

            return queueEntry;
        }
    }
}