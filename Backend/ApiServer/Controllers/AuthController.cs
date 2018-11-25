using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using CoreClassLibrary.Models.Map;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiServer.Controllers
{
    [Route("api/v1/[controller]")]
    public class AuthController : Controller
    {

        // GET api/v1/auth/selftest
        [HttpGet("selftest/")]
        [Authorize]
        public string Get()
        {
            ClaimsPrincipal currentUser = HttpContext.User;

            return String.Format("user({0}) is allowed to view page", currentUser);
        }
    }
}
