using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using System.Text;
using ApiServer.Controllers;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Respository;
using log4net;

namespace CoreClassLibrary.Helper
{
    public class MapCreatorHelper
    {
        private readonly ILog logger = LogManager.GetLogger(typeof(MapCreatorHelper));

        private readonly IIslandRepository _islandRepository;
        private readonly Random _rnd;

        public MapCreatorHelper(int seed)
        {
            _rnd = new Random(seed);

            _islandRepository = new IslandRepository();

            //factory = new IslandFactorySquare();

            // 
        }

        /// <summary>
        /// creates Islands and positions them on map
        /// </summary>
        /// <param name="count"></param>
        public List<Island> createIslands(int count)
        {
            List<Island> islands = new List<Island>();

            for (int createdIslands = 0; createdIslands < count; createdIslands++)
            {
                int size = _rnd.Next(20, 30);
                int seed = _rnd.Next(0, 10);

                Island island = this.createIsland(size, seed);

                while (this.checkCollisions(island, islands))
                {
                    // move island and recheck
                    this.MoveIsland(island);

                    // TODO: add abort condition
                }

                islands.Add(island);
            }

            // save island
            foreach (Island island in islands)
            {
                _islandRepository.Add(island);
            }

            // return "copy"/ref of all islands for mapping
            return islands;
        }

        /// <summary>
        /// moves island by random amount
        /// </summary>
        /// <param name="island"></param>
        private void MoveIsland(Island island)
        {
            int moveX = _rnd.Next(island.size / -3, island.size / 3);
            int moveY = _rnd.Next(island.size / -3, island.size / 3);

            foreach (Tile tile in island.Tiles)
            {
                tile.Position = tile.Position + new Vector3(moveX, moveY, 0);
            }

            logger.DebugFormat("island {0}, moved by ({1}|{2})", island, moveX, moveY);
        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="island">island to check if it has collisions</param>
        /// <param name="islands">map data to check for collisions</param>
        /// <returns>returns true on collision</returns>
        private bool checkCollisions(Island island, List<Island> islands)
        {
            foreach (Tile tile in island.Tiles)
            {
                if (islands.Any(i => i.getTile(tile.Position) != null))
                {
                    logger.DebugFormat("Found collision in {0}", tile);

                    return true;
                }
            }

            return false;
        }

        private Island createIsland(int size, int seed)
        {
            int zCoord = 1;

            IIslandFactory factory = new IslandFactoryOrganic(seed);
            var island = factory.GetRndIsland(size, zCoord);

            return island;
        }
    }
}
