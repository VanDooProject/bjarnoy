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
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    [ApiController]
    public class QueueController : ControllerBase
    {
        private ILog logger = LogManager.GetLogger(typeof(QueueController));

        // POST api/v1/queue/my
        /// <summary>
        /// build building on tile
        /// </summary>
        /// <returns></returns>
        /// TODO: refactor this long method
        [HttpGet("my/")]
        [Authorize]
        public IEnumerable<Queue> GetUserQueues()
        {
            UserRepository userRepository = new UserRepository();
            UserModel user = userRepository.GetByUserId(HttpContext.User.FindFirst(c => c.Type == ClaimTypes.NameIdentifier).Value);

            Debug.Assert(user != null); // we have a problem with tokens when this triggers

            QueueRepository queueRepository = new QueueRepository();
            return queueRepository.AllUnprocessedByUser(user);
        }
    }
}
