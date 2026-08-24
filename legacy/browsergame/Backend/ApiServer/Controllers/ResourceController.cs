using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.Resources;
using CoreClassLibrary.Respository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    public class ResourceController : GameAPIController
    {

        // GET api/v1/resource/user
        [HttpGet("user/")]
        [Authorize]
        public EntityResources GetResourcesOfCurrentPlayer()
        {
            Player player = getCurrentPlayer();

            return player.EntityResources;
        }
    }
}
