using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Resources;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;

namespace CoreClassLibrary.QueueHandler
{
    public class BuildQueueHandler
    {
        private ILog logger = LogManager.GetLogger(typeof(BuildQueueHandler));

        private readonly IslandRepository _islandRepository = new IslandRepository();
        private readonly IPlayerRepository _playerRepository = new PlayerRepository();

        public void processEntry(BuildingQueue entry)
        {
            Tile tile = entry.Tile;
            tile.Building = entry.Building;
            _islandRepository.ReplaceTile(tile);

            if (entry.Building is ResourceBuilding resBuilding)
            {
                // find old production
                Resources oldProduction = new Resources();
                var oldTech = BuildTechController.Instance.findTech(resBuilding.type, resBuilding.Level - 1);
                if (oldTech != null && oldTech.Building is ResourceBuilding oldResourceBuilding)
                {
                    oldProduction = oldResourceBuilding.gatherRate;
                }

                // set new production -> remove old production and add new production
                var player = entry.Owner;
                player.EntityResources.addProduction(resBuilding.gatherRate - oldProduction);

                // save production
                _playerRepository.ReplaceAwareOfResources(player);
            }

            logger.InfoFormat("processed {0}!", entry);
        }
    }
}
