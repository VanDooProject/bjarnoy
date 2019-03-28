using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using CoreClassLibrary;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.Resources;
using CoreClassLibrary.Respository;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;

namespace ApiServer.Controllers
{
    [ApiController] // <- for automatic data validation as of https://docs.microsoft.com/en-us/aspnet/core/mvc/models/validation?view=aspnetcore-2.1#handle-model-state-errors
    // mainly from https://auth0.com/blog/securing-asp-dot-net-core-2-applications-with-jwts/
    [Route("api/v1/[controller]")]
    public class AuthController : ControllerBase
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
        public IActionResult SignIn([FromBody]SignInModel login)
        {
            IActionResult response = Unauthorized();
            var user = Authenticate(login);
            var player = GetOwnedPlayerBy(user);

            if (user != null)
            {
                var tokenString = BuildToken(user, player);
                response = Ok(new { token = tokenString });
            }

            return response;
        }


        // DELETE api/v1/auth/delete
        /// <summary>
        /// deletes current user / owner of token
        /// </summary>
        /// <returns></returns>
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
                return base.BadRequest("user not found to delete");
            }

            // remove user
            userRepository.Delete(IsUserInDb);

            return Ok();
        }


        // GET api/v1/auth/refresh
        /// <summary>
        /// refresh token to prevent logout via timeout
        /// </summary>
        /// <returns></returns>
        [Authorize]
        [HttpGet("refresh")]
        public IActionResult RefreshToken()
        {
            UserRepository userRepository = new UserRepository();

            string UserId = HttpContext.User.FindFirst(c => c.Type == ClaimTypes.NameIdentifier).Value;
            if (UserId == "")
            {
                // TODO: test (cause this is untested)
                return base.Forbid();
            }

            UserModel user = userRepository.GetByUserId(UserId);

            if (user == null)
            {
                // user not found
                return base.BadRequest("no user found (for this token)");
            }

            PlayerRepository playerRepository = new PlayerRepository();

            string playerId = HttpContext.User.FindFirst(c => c.Type == GameClaims.PlayerId).Value;
            Debug.Assert(playerId != "");
            Player player = playerRepository.GetByPlayerId(playerId);

            // TODO test - and refactor -> extract (to make unit tests possible)
            if (!player.Permissions.Any(p => p.User._id == user._id))
            {
                return base.BadRequest("rights for this player were removed");
            }

            // refresh
            var tokenString = BuildToken(user, player);
            return Ok(new { token = tokenString });
        }


        // POST api/v1/auth/sign-up
        [AllowAnonymous]
        [HttpPost("sign-up")]
        public IActionResult SignUp([FromBody]SignUpModel signUp)
        {
            IActionResult response = StatusCode(500);

            UserRepository userRepository = new UserRepository();
            PlayerRepository playerRepository = new PlayerRepository();

            // check if user already exists
            UserModel IsUserInDb = userRepository.GetByUsername(signUp.Username);
            if (IsUserInDb != null)
            {
                return base.BadRequest("user is already in DB");
            }

            // use given data for new User(Model)
            UserModel user = new UserModel();
            //user._id = new ObjectId();
            user.Username = signUp.Username;
            user.Email = signUp.Mail;

            userRepository.Add(user);


            // TODO: maybe seperate this logic to a user factory?
            var PlayerFactory = new PlayerFactory();
            var player = PlayerFactory.GetStartingPlayer(user.Username);
            player.setOwner(user);

            playerRepository.Add(player);

            string salt = user._id.ToString();
            user.Password = HashHelper.Instance.Hash(signUp.Password, salt);

            userRepository.Replace(user);

            if (user != null)
            {
                var tokenString = BuildToken(user, player);
                response = Ok(new { token = tokenString });
            }

            return response;
        }

        private string BuildToken(UserModel user, Player player)
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
                new Claim(ClaimTypes.NameIdentifier, user._id.ToString()),


                //set game specific parts
                new Claim(GameClaims.WorldId, SettingsController.Instance.GetSettings().V1.WorldId),

                // set access to player
                new Claim(GameClaims.PlayerId, player._id.ToString()),
                //new Claim(GameClaims.PlayerName, player.Name),
                new Claim(GameClaims.PlayerPermission, player.Permissions.First(u => u.User._id == user._id).Permission.ToString()),
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

        // TODO use exceptions
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
            string salt = user._id.ToString();
            string hash = HashHelper.Instance.Hash(login.Password, salt);
            if (user.Password == hash)
            {
                return user;
            }

            // user found -> password wrong
            return null;
        }

        private Player GetOwnedPlayerBy(UserModel user)
        {
            var playerRepository = new PlayerRepository();

            Player player = playerRepository.GetPlayerOwnedBy(user);

            Debug.Assert(player != null);

            return player;
        }
    }
}
