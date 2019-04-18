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
using MongoDB.Bson;

namespace CoreClassLibrary.QueueHandler
{
    public class TowerBuildQueueHandler : IBuildQueueHandler
    {
        private ILog logger = LogManager.GetLogger(typeof(TowerBuildQueueHandler));

        private readonly IslandRepository _islandRepository = new IslandRepository();
        private readonly IPlayerRepository _playerRepository = new PlayerRepository();

        public void processEntry(BuildingQueue entry)
        {
            Building building = entry.Building;
            Tile currentTile = entry.Tile;
            if (building is Tower tower)
            {
                // find island
                var island = _islandRepository.GetIslandById( (ObjectId) entry.Tile.IslandId.Id);

                // set ownership of neighbours
                //List<Tile> neighbours = new List<Tile>();
                //neighbours.Add(currentTile);
                //for (int range = 0; range < tower.RangeOfInfluence; range++)
                //{
                //    List<Tile> tempNeighbours = new List<Tile>();
                //    foreach (Tile tile in neighbours)
                //    {
                //        tempNeighbours.AddRange(island.getNeighbors(currentTile));
                //    }
                //    neighbours.AddRange(tempNeighbours);
                //}
                //
                //island.getRange(currentTile, 1);
                //island.getRange(currentTile, 2);

                List<Tile> neighbours = island.getRange(currentTile, tower.RangeOfInfluence);

                // set new ownership
                Player player = _playerRepository.GetByPlayerId(entry.Owner._id);
                int ownershipsChanged = 0;

                foreach (Tile tile in neighbours)
                {
                    if (tile.Owner == null)
                    {
                        tile.Owner = player.GetMinimalClone();

                        // and save
                        _islandRepository.ReplaceTile(tile);

                        ownershipsChanged++;
                    }
                }

                logger.InfoFormat("checked {0} neighbours around tower and changed {1} ownerships", neighbours.Count, ownershipsChanged);
            }

            logger.InfoFormat("processed {0}!", entry);
        }
    }
}
