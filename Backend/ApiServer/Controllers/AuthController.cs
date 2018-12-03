using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using CoreClassLibrary;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Respository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace ApiServer.Controllers
{
    [ApiController] // <- for automatic data validation as of https://docs.microsoft.com/en-us/aspnet/core/mvc/models/validation?view=aspnetcore-2.1#handle-model-state-errors
    // mainly from https://auth0.com/blog/securing-asp-dot-net-core-2-applications-with-jwts/
    [Route("api/v1/[controller]")]
    public class AuthController : Controller
    {
        private IConfiguration _config;

        public AuthController(IConfiguration config)
        {
            _config = config;
        }


        // GET api/v1/auth/selftest
        [HttpGet("selftest/")]
        [Authorize]
        public string Get()
        {
            ClaimsPrincipal currentUser = HttpContext.User;

            return String.Format("user({0}) is allowed to view page", currentUser);
        }
        // GET api/v1/auth/selftest/session/
        [HttpGet("selftest/session/")]
        [Authorize(Policy = "ValidSession")]
        public string GetTestSession()
        {
            ClaimsPrincipal currentUser = HttpContext.User;

            return String.Format("user({0}) is allowed to view page - active session found", currentUser);
        }

        // GET api/v1/auth/selftest/admin/
        [HttpGet("selftest/admin/")]
        [Authorize(Roles = "Admin")]
        public string GetAdmin()
        {
            ClaimsPrincipal currentUser = HttpContext.User;

            return String.Format("user({0}) is allowed to view ADMIN page", currentUser);
        }


        // POST api/v1/auth/sign-in
        [AllowAnonymous]
        [HttpPost("sign-in")]
        public IActionResult CreateToken([FromBody]SignInModel login)
        {
            IActionResult response = Unauthorized();
            var user = Authenticate(login);

            if (user != null)
            {
                var tokenString = BuildToken(user);
                response = Ok(new { token = tokenString });
            }

            return response;
        }


        // DELETE api/v1/auth/delete
        [Authorize]
        [HttpDelete("delete")]
        public IActionResult DeleteAccount()
        {
            UserRepository userRepository = new UserRepository();

            string UserId = HttpContext.User.FindFirst(c => c.Type == ClaimTypes.NameIdentifier).Value;
            if (UserId == "")
            {
                // TODO: test (cause this is untested)
                return base.Forbid();
            }

            UserModel IsUserInDb = userRepository.GetByUserId(UserId);

            if (IsUserInDb == null)
            {
                // user not found
                return base.BadRequest();
            }

            // remove user
            userRepository.Delete(IsUserInDb);

            return Ok();
        }


        // POST api/v1/auth/sign-up
        [AllowAnonymous]
        [HttpPost("sign-up")]
        public IActionResult SignUp([FromBody]SignUpModel signUp)
        {
            IActionResult response = StatusCode(500);

            UserRepository userRepository = new UserRepository();

            // check if user already exists
            UserModel IsUserInDb = userRepository.GetByUsername(signUp.Username);
            if (IsUserInDb != null)
            {
                return base.BadRequest();
            }

            // use given data for new User(Model)
            UserModel user = new UserModel();
            user.Username = signUp.Username;
            user.Password = HashHelper.Instance.Hash(signUp.Password, user._id);

            userRepository.Add(user);

            if (user != null)
            {
                var tokenString = BuildToken(user);
                response = Ok(new { token = tokenString });
            }

            return response;
        }

        private string BuildToken(UserModel user)
        {
            // most claims are defined here: http://tools.ietf.org/html/rfc7519#section-4
            var claims = new[] {
                //new Claim(JwtRegisteredClaimNames.Sub, user.Username), // Subject
                //new Claim(JwtRegisteredClaimNames.Email, user.Email),
                //new Claim(JwtRegisteredClaimNames.Birthdate, user.Birthdate.ToString("yyyy-MM-dd")),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()), // JWT ID - security measure against replay attacks

                // https://stackoverflow.com/a/38426677/2298744
                new Claim(ClaimTypes.Role, "Admin"),

                // set user ID
                new Claim(ClaimTypes.NameIdentifier, user._id)
            };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(_config["Jwt:Issuer"],
                _config["Jwt:Issuer"],
                claims: claims,
                notBefore: DateTime.UtcNow,
                expires: DateTime.Now.AddMinutes(30), // time how long cookie is valid
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private UserModel Authenticate(SignInModel login)
        {
            UserRepository userRepository = new UserRepository();

            UserModel user = userRepository.GetByUsername(login.Username);

            // no access if user not found
            if (user == null)
            {
                return null;
            }

            // compare password
            if (user.Password == HashHelper.Instance.Hash(login.Password, user._id))
            {
                return user;
            }

            // user found -> password wrong
            return null;
        }
    }
}
