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

namespace CoreClassLibrary.Factory
{
    public class PlayerFactory
    {
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
            Island island = islandRepository.AllIslands().First();
            island = islandRepository.GetIslandById(island._id); // to get tiles for islands

            StartPositionHelper StartHelper = new StartPositionHelper(island);

            Tile startPosition = StartHelper.getStartPosition();
            if (startPosition == null)
            {
                throw new GameException("no tile found to create tower");
            }

            // own this tile
            startPosition.Owner = player;
            islandRepository.ReplaceTile(startPosition);

            // build tower
            BuildingQueue queueEntry = StartHelper.createQueueEntry(startPosition, player);
            queueRepository.Add(queueEntry);

            return startPosition;
        }
    }
}
