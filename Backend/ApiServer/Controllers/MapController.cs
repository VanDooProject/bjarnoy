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
        // GET api/values
        [HttpGet("demo/")]
        public IEnumerable<Tile> Get()
        {
            return new Tile[] {
                new Tile(0,0,0),
                new Tile(1,0,0),
                new Tile(0,1,0),
                new Tile(1,1,0),

                new Tile(0,0,1),
                new Tile(1,0,1),
                new Tile(0,1,1),
                new Tile(1,1,1),
            };
        }

        // GET api/values/5
        [HttpGet("{id}")]
        public string Get(int id)
        {
            return "value";
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
