using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map;
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
        [HttpPost("islands/")]
        public int CreateIslands()
        {
            IslandRepository islandRepository = new IslandRepository();

            IIslandFactory factory;
            //factory = new IslandFactorySquare();
            factory = new IslandFactoryOrganic();

            int size = 25;
            int zCoord = 1;


            Random rnd = new Random();
            rnd.Next(size - 5, size + 5); // TODO - fix, never used

            var island = factory.GetRndIsland(size, zCoord);

            // TODO: move island to free location on map

            islandRepository.Add(island);

            return 0;
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

        private static string GetEnvironmentVariable(string name)
        {
            return String.Format("{0}={1}", name, Environment.GetEnvironmentVariable(name));
        }
    }
}
