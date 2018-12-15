using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using System.Security.Claims;
using System.Threading.Tasks;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Respository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    public class ProfileController : ControllerBase
    {
        // GET api/v1/profile/self
        /// <summary>
        /// get profile of current user by token
        /// </summary>
        /// <returns>own user</returns>
        [HttpGet("self/")]
        [Authorize]
        public UserModel GetSelf()
        {
            UserRepository userRepository = new UserRepository();

            string UserId = HttpContext.User.FindFirst(c => c.Type == ClaimTypes.NameIdentifier).Value;
            if (UserId == "")
            {
                throw new Exception("this case should never happen - token without valid user data");
            }

            UserModel IsUserInDb = userRepository.GetByUserId(UserId);

            if (IsUserInDb == null)
            {
                throw new Exception("this case should never happen - token user not found in DB");
            }

            return IsUserInDb;
        }
    }
}
