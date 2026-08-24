using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    public class ServerTime : ControllerBase
    {

        // GET api/v1/ServerTime
        [HttpGet]
        [Authorize]
        public DateTime GetServerTime()
        {
            return DateTime.Now;
        }
    }
}
