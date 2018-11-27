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
                Environment.GetEnvironmentVariable("BRANCH")
            };

            return infoList;
        }
    }
}
