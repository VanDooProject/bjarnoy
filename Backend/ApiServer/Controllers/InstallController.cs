using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using System.Threading.Tasks;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Helper;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Coordinates;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Respository;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    public class InstallController : ControllerBase
    {

        // GET api/v1/install/info
        [HttpGet("info/")]
        public List<string> GetInfo()
        {

            List<string> infoList = new List<string>
            {
                GetEnvironmentVariable("VIRTUAL_HOST"),
                GetEnvironmentVariable("CI_COMMIT_SHA"),
                GetEnvironmentVariable("BRANCH"),
                String.Format("Database Server={0}:{1}",
                    SettingsController.Instance.GetSettings().V1.MongoDatabaseServerAddress,
                    SettingsController.Instance.GetSettings().V1.MongoDatabaseServerPort
                )
            };

            return infoList;
        }
        // POST api/v1/install/islands/
        [HttpPost("islands/{count=2}/{seed=1}")]
        public IActionResult CreateIslands(int count, int seed)
        {
            if (count < 1)
            {
                return BadRequest("count has to be larger than 0");
            }

            var IslandHelper = new MapCreatorHelper(seed);

            var islands = IslandHelper.createIslands(count);

            MapRenderer renderer = new MapRenderer();
            renderer.GenerateBitmapFromIslands(islands, "map_full.png");

            return Ok();
        }

        // POST api/v1/install/water/
        [HttpPost("water/")]
        public IActionResult FillMapWithWater(/*int width, int height*/)
        {
            //if (width < 1 || height < 1)
            //{
            //    return BadRequest();
            //}

            int countAddedWaterTiles = 0;

            const double TOLERANCE = 0.001;
            IslandRepository islandRepository = new IslandRepository();
            var tiles =  islandRepository.AllTiles();

            int maxX = tiles.Max(x => x.Position.x);
            int maxY = tiles.Max(x => x.Position.y);
            int minX = tiles.Min(x => x.Position.x);
            int minY = tiles.Min(x => x.Position.y);

            List<Tile> WaterTiles = new List<Tile>();

            for (int y = minY; y <= maxY; y++)
            {
                for (int x = minX; x <= maxX; x++)
                {
                    if (!tiles.Any(t => Math.Abs(t.Position.x - x) < TOLERANCE && Math.Abs(t.Position.y - y) < TOLERANCE ))
                    {
                        WaterTiles.Add(new WaterTile(new HexCoordinates3D(x, y)));
                        countAddedWaterTiles++;
                    }
                }
            }

            islandRepository.AddTiles(WaterTiles);

            return Ok(countAddedWaterTiles);
        }

        // DELETE api/v1/install/islands/
        [HttpDelete("islands/")]
        public IActionResult DeleteIslands()
        {
            IslandRepository islandRepository = new IslandRepository();

            List<Island> islands = islandRepository.AllIslands();
            foreach (Island island in islands)
            {
                islandRepository.Delete(island);
            }

            return Ok();
        }

        // DELETE api/v1/install/map/
        /// <summary>
        /// only deletes tiles not islands
        /// </summary>
        /// <returns></returns>
        [HttpDelete("map/")]
        public IActionResult DeleteMap()
        {
            IslandRepository islandRepository = new IslandRepository();

            islandRepository.DeleteAllTiles();

            return Ok();
        }

        private static string GetEnvironmentVariable(string name)
        {
            return String.Format("{0}={1}", name, Environment.GetEnvironmentVariable(name));
        }
    }
}
