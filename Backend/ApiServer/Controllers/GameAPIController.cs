using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Respository;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [ApiController]
    public abstract class GameAPIController : ControllerBase
    {
        protected UserModel getCurretUser()
        {
            string userId = HttpContext.User.FindFirst(c => c.Type == ClaimTypes.NameIdentifier).Value;
            Debug.Assert(userId != ""); // we have a problem with tokens when this triggers
            if (userId == "")
            {
                throw new Exception("this case should never happen - token without valid user data");
            }


            UserRepository userRepository = new UserRepository();
            UserModel user = userRepository.GetByUserId(userId);
            Debug.Assert(user != null); // we have a problem with tokens when this triggers
            
            if (user == null)
            {
                throw new Exception("this case should never happen - token user not found in DB");
            }

            return user;
        }
    }
}
