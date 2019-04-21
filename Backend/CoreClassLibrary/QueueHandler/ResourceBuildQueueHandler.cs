using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Exceptions;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.Resources;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;

namespace CoreClassLibrary.QueueHandler
{
    public class ResourceBuildQueueHandler : IBuildQueueHandler
    {
        private ILog logger = LogManager.GetLogger(typeof(ResourceBuildQueueHandler));

        private readonly IslandRepository _islandRepository = new IslandRepository();
        private readonly IPlayerRepository _playerRepository = new PlayerRepository();

        public void processEntry(BuildingQueue entry)
        {
            if (entry.Building is ResourceBuilding resBuilding)
            {
                // find old production
                Resources oldProduction = new Resources();
                try
                {
                    var oldTech = BuildTechController.Instance.findTech(resBuilding.type, resBuilding.Level - 1);
                    if (oldTech != null && oldTech.Building is ResourceBuilding oldResourceBuilding)
                    {
                        oldProduction = oldResourceBuilding.gatherRate;
                    }
                }
                catch (BuildBuildingException ex)
                {
                    // -> fallback to zero resources before
                    if (resBuilding.Level != 1)
                    {
                        throw new GameException("didn't find tech for building which is not level 1 -> missing techtree!!", ex);
                    }
                }

                PlayerRepository playerRepository = new PlayerRepository();
                Player player = playerRepository.GetByPlayerId(entry.Owner._id);

                // set new production -> remove old production and add new production
                player.EntityResources.addProduction(resBuilding.gatherRate - oldProduction);

                // save production
                _playerRepository.ReplaceAwareOfResources(player);
            }

            logger.InfoFormat("processed {0}!", entry);
        }
    }
}
