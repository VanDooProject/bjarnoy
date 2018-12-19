using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using System.Threading.Tasks;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Respository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    public class MapController : ControllerBase
    {

        // GET api/v1/map/islands
        /// <summary>
        /// gets tiles *without* islands
        /// </summary>
        /// <returns></returns>
        [HttpGet("islands/")]
        [Authorize]
        public IEnumerable<Island> GetIslands()
        {
            IslandRepository islandRepository = new IslandRepository();
            return islandRepository.AllIslands();
        }

        // GET api/v1/map/tiles
        [HttpGet("tiles/")]
        [Authorize]
        public IEnumerable<Tile> GetTiles()
        {
            IslandRepository islandRepository = new IslandRepository();
            return islandRepository.AllTiles();
        }

        // GET api/v1/map/tile/0/0/0
        [HttpGet("tile/{x}/{y}/{z}")]
        [Authorize]
        public Tile GetTile(float x, float y, float z)
        {
            IslandRepository islandRepository = new IslandRepository();
            return islandRepository.getTile(x, y, z);
        }

        // GET api/v1/map/demo
        [HttpGet("demo/")]
        public IEnumerable<Tile> Get()
        {
            int size = 5;
            return this.Get(size);
        }

        // GET api/v1/map/demo/{size}
        [HttpGet("demo/{size}")]
        public IEnumerable<Tile> Get(int size)
        {
            List<Tile> TileList = new List<Tile>();
            int layers = 3;
            Random r = new Random();
            String[] tileTypes = {"grass", "hill"};
            for (int z = 0; z < layers; z++)
            {
                for (int x = -size; x < size; x++)
                {
                    for (int y = -size; y < size; y++)
                    {
                        Vector3 position = new Vector3(x, y, z);
                        TileList.Add(new Tile(position));
                    }
                }
            }

            return TileList;
        }

        // GET /api/v1/map/demo/island/5
        [HttpGet("demo/island/{size}")]
        public IEnumerable<Island> GetRndIsland(int size)
        {
            List<Island> IslandList = new List<Island>();
            IslandFactory factory = new IslandFactory();

            IslandList.Add(factory.GetRndIsland(size, 1));

            return IslandList;
        }
    }
}
