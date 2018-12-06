using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    public class MapController : Controller
    {

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
                        TileList.Add(new Tile( x,  y, z, tileTypes[r.Next(tileTypes.Length)]));
                    }
                }
            }

            return TileList;
        }

        [HttpGet("demo/biom/{size}")]
        public IEnumerable<Biom> GetRndBiom(int size)
        {
            List<Biom> BiomList = new List<Biom>();
            BiomFactory factory = new BiomFactory();
            for (int loop_count = 0; loop_count < size; loop_count++)
            {
                BiomList.Add(factory.GetRndBiomAndTiles(loop_count));
            }

            return BiomList;
        }

        [HttpGet("demo/island")]
        public IEnumerable<Island> GetRndIsland()
        {
            List<Island> IslandList = new List<Island>();
            IslandFactory factory = new IslandFactory();
            IslandList.Add(factory.GetRndIsland());

            return IslandList;
        }

        [HttpGet("demo/island/new/{size}")]
        public IEnumerable<Island> GetRndIslandNew(int size)
        {
            List<Island> IslandList = new List<Island>();
            IslandFactory factory = new IslandFactory();
            IslandList.Add(factory.GetRndIslandNew(size, 1));

            return IslandList;
        }
        

        // POST api/values
        [HttpPost]
        public void Post([FromBody]string value)
        {
        }

        // PUT api/values/5
        [HttpPut("{id}")]
        public void Put(int id, [FromBody]string value)
        {
        }

        // DELETE api/values/5
        [HttpDelete("{id}")]
        public void Delete(int id)
        {
        }
    }
}
