using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Exceptions;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.TechQueues;
using log4net;

namespace CoreClassLibrary.Helper
{
    public class StartPositionHelper
    {
        private readonly ILog logger = LogManager.GetLogger(typeof(StartPositionHelper));
        private readonly Island _island;

        public StartPositionHelper(Island island)
        {
            if (island == null || island.Tiles == null || island.Tiles.Count == 0)
            {
                throw new GameException("island data is not complete");
            }

            _island = island;
        }

        /// <summary>
        /// 
        /// </summary>
        /// <returns>returns null if no tile was found, otherwise it will return found tile</returns>
        public Tile getStartPosition()
        {
            // loop through all tiles and check if there are 2 grass and 1 forest tile nearby and no water
            foreach (Tile tile in _island.Tiles)
            {
                // only use grasstiles
                if (!(tile is GrassTile))
                {
                    continue; // skip since wrong tile type
                }

                // only use unowned
                if (tile.Owner != null)
                {
                    continue; // skip since tile is owned
                }

                List<Tile> neighbors = _island.getNeighbors(tile);
                List<Tile> neighborsRange2 = _island.getRange(tile, 2); // range to space players apart from each other

                int ownedTiles = neighborsRange2.Count(t => t.Owner != null);
                if (ownedTiles > 0)
                {
                    continue; // skip since neighbor-tiles are owned by someone
                }

                int waterTiles = neighborsRange2.Count(t => t is WaterTile || t is CoastalWaterTile);
                int forestTiles = neighbors.Count(t => t is ForestTile);
                int grassTiles = neighbors.Count(t => t is GrassTile);
                // TODO - make this values configurable
                if (
                    waterTiles == 0 &&
                    forestTiles >= 1 &&
                    grassTiles >= (2 + 1) // +1 because we have to also count our own tile we are on
                )
                {
                    logger.DebugFormat("found start position at {0} with {1} forest and {2} grass", tile, forestTiles, grassTiles);
                    return tile;
                }
            }

            return null;
        }

        public BuildingQueue createQueueEntry(Tile tile, Player owner)
        {
            var buildTech = BuildTechController.Instance.findTech(typeof(Tower).Name, 1);


            BuildingQueue queueEntry = new BuildingQueue();
            queueEntry.Tile = tile;
            queueEntry.Building = buildTech.Building;
            queueEntry.Owner = owner;
            queueEntry.StartTime = Time.Now;

            // build is done in 0 secs
            queueEntry.EndTime = Time.Now;

            return queueEntry;
        }
    }
}
