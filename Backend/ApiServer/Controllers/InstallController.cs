using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
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
                GetEnvironmentVariable("BRANCH")
            };

            return infoList;
        }

        private static string GetEnvironmentVariable(string name)
        {
            return String.Format("{0}={1}", name, Environment.GetEnvironmentVariable(name));
        }
    }
}
