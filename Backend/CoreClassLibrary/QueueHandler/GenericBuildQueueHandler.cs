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
    public class GenericBuildQueueHandler : IBuildQueueHandler
    {
        private ILog logger = LogManager.GetLogger(typeof(GenericBuildQueueHandler));

        private readonly IslandRepository _islandRepository = new IslandRepository();

        public void processEntry(BuildingQueue entry)
        {
            Tile tile = entry.Tile;
            tile.Building = entry.Building;
            _islandRepository.ReplaceTile(tile);
            

            logger.InfoFormat("processed {0}!", entry);
        }
    }
}
