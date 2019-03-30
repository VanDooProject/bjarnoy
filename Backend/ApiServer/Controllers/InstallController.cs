using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using System.Threading.Tasks;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Helper;
using CoreClassLibrary.Models.Map;
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
            var IslandHelper = new MapCreatorHelper(seed);

            var islands = IslandHelper.createIslands(count);

            MapRenderer renderer = new MapRenderer();
            renderer.GenerateBitmapFromIslands(islands, "map_full.png");

            return Ok();
        }

        // POST api/v1/install/water/
        [HttpPost("water/{width}/{height}")]
        public IActionResult FillMapWithWater(int width, int height)
        {
            if (width < 1 || height < 1)
            {
                return BadRequest();
            }

            int countAddedWaterTiles = 0;

            int z = 1;
            const double TOLERANCE = 0.001;
            IslandRepository islandRepository = new IslandRepository();
            var tiles =  islandRepository.AllTiles();

            List<Tile> WaterTiles = new List<Tile>();

            for (int y = 0; y < width; y++)
            {
                for (int x = 0; x < height; x++)
                {
                    if (!tiles.Any(t => Math.Abs(t.Position.X - x) < TOLERANCE && Math.Abs(t.Position.Y - y) < TOLERANCE ))
                    {
                        WaterTiles.Add(new WaterTile(new Vector3(x, y, z)));
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
