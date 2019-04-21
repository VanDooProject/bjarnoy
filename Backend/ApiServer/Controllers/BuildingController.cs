using System;
using CoreClassLibrary.Exceptions;
using CoreClassLibrary.Helper;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
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
        private readonly IQueueRepository _queueRepository;

        public BuildingController()
        {
            _buildHelper = new BuildHelper();
            _queueRepository = new QueueRepository();
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
            Player player = getCurrentPlayer();

            try
            {
                BuildingQueue queueEntry = _buildHelper.BuildBuilding(build, player);
                _queueRepository.Add(queueEntry);

                return (queueEntry == null) ? (IActionResult) BadRequest() : Ok(queueEntry);
            }
            catch (BuildBuildingException e)
            {
                logger.Warn(e.Message);
                return BadRequest(e.Message);
            }
            catch (GameException e)
            {
                logger.Warn(e.Message);
                return BadRequest(e.Message);
            }
        }
    }
}
