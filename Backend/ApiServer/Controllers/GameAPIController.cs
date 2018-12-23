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
            UserRepository userRepository = new UserRepository();
            UserModel user =
                userRepository.GetByUserId(HttpContext.User.FindFirst(c => c.Type == ClaimTypes.NameIdentifier).Value);

            // we have a problem with tokens when this triggers
            Debug.Assert(user != null);
            return user;
        }
    }
}
