using System;
using CoreClassLibrary.Helper;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.TechQueues;
using log4net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    public class BuildingController : GameAPIController
    {
        private ILog logger = LogManager.GetLogger(typeof(BuildingController));
        private readonly BuildHelper _buildHelper;

        public BuildingController()
        {
            _buildHelper = new BuildHelper();
        }

        // POST api/v1/building/build
        /// <summary>
        /// build building on tile
        /// </summary>
        /// <returns></returns>
        /// TODO: refactor this long method
        [HttpPost("build/")]
        [Authorize]
        public IActionResult PostBuild([FromBody]BuildBuildingModel build)
        {
            UserModel user = getCurretUser();
            
            BuildingQueue queueEntry = _buildHelper.BuildBuilding(build, user);
            return (queueEntry == null) ? (IActionResult)BadRequest() : Ok(queueEntry);
        }
    }
}
