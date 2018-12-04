using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Models.Map;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    public class InstallController : Controller
    {

        // GET api/v1/install/info
        [HttpGet("info/")]
        public List<string> Get()
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

        private static string GetEnvironmentVariable(string name)
        {
            return String.Format("{0}={1}", name, Environment.GetEnvironmentVariable(name));
        }
    }
}
