using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using CoreClassLibrary.Models.Map;
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
            String[] tileTypes = {"Grass", "Hill"};
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

            // return new Tile[] {
            //     new Tile(0,0,0),
            //     new Tile(1,0,0),
            //     new Tile(0,1,0),
            //     new Tile(1,1,0),
            // 
            //     new Tile(0,0,1),
            //     new Tile(1,0,1),
            //     new Tile(0,1,1),
            //     new Tile(1,1,1),
            // };
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
