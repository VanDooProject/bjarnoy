using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using CoreClassLibrary.Exceptions;
using CoreClassLibrary.Helper;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.Resources;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;

namespace CoreClassLibrary.Factory
{
    public class PlayerFactory
    {
        private readonly ILog logger = LogManager.GetLogger(typeof(PlayerFactory));

        public Player GetStartingPlayer(string DisplayName)
        {
            var player = new Player()
            {
                DisplayName = DisplayName
            };

            // set res
            player.EntityResources = new EntityResources()
            {
                LastResourceStorageRefresh = DateTime.Now,
                ResourceStoredAtLastCalculation = new Resources() { wood = 100, stone = 100, iron = 100, gold = 100 },
                ResourceStorageCapacity = new Resources() { wood = 800, stone = 800, iron = 800, gold = 800 },
                HourlyResourceProduction = new Resources() { wood = 10, stone = 10, iron = 10, gold = 10 },
            };

            // create base
            // set start tower




            return player;
        }

        public Tile createAndSavePlayerBase(Player player)
        {
            QueueRepository queueRepository = new QueueRepository();

            IslandRepository islandRepository = new IslandRepository();
            List<Island> islands = islandRepository.AllIslands();
            int island_index = 0;
            Island island = islandRepository.GetIslandById(islands[island_index]._id); // to get tiles for islands
            logger.DebugFormat("search start pos on island {0}", island);

            StartPositionHelper StartHelper = new StartPositionHelper(island);

            Tile startPosition;
            while ( (startPosition = StartHelper.getStartPosition()) == null)
            {
                // get next island
                try
                {
                    island_index++;
                    island = islandRepository.GetIslandById(islands[island_index]._id); // to get tiles for islands

                    StartHelper = new StartPositionHelper(island);

                    logger.DebugFormat("switched island to {0} cause old is full", island);
                }
                catch(Exception ex)
                {
                    throw new GameException("no tile found to create tower / no empty island", ex);
                }
            }

            // own this tile
            startPosition.Owner = player;
            islandRepository.ReplaceTile(startPosition);
            logger.DebugFormat("start position found on {0} for {1}", startPosition, player);

            // build tower
            BuildingQueue queueEntry = StartHelper.createQueueEntry(startPosition, player);
            queueRepository.Add(queueEntry);

            return startPosition;
        }
    }
}
