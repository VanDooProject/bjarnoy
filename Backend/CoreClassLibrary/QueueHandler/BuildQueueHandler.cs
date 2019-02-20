using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;

namespace CoreClassLibrary.QueueHandler
{
    public class BuildQueueHandler
    {
        private ILog logger = LogManager.GetLogger(typeof(BuildQueueHandler));

        private IslandRepository islandRepository = new IslandRepository();

        public void processEntry(BuildingQueue entry)
        {
            Tile tile = entry.Tile;
            tile.Building = entry.Building;
            islandRepository.ReplaceTile(tile);

            logger.InfoFormat("processed {0}!", entry);
        }
    }
}
