using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Numerics;
using System.Security.Claims;
using System.Threading.Tasks;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    [ApiController]
    public class QueueController : GameAPIController
    {
        private ILog logger = LogManager.GetLogger(typeof(QueueController));

        // POST api/v1/queue/my
        /// <summary>
        /// gets all queue entries for player
        /// </summary>
        /// <returns></returns>
        [HttpGet("my/")]
        [Authorize]
        public IEnumerable<Queue> GetUserQueues()
        {
            Player player = getCurrentPlayer();

            QueueRepository queueRepository = new QueueRepository();
            return queueRepository.AllUnprocessedByUser(player);
        }
    }
}
