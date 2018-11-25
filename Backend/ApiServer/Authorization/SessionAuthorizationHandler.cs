using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;

namespace ApiServer.Authorization
{

    // https://docs.microsoft.com/en-us/aspnet/core/security/authorization/policies?view=aspnetcore-2.1
    public class SessionAuthorizationHandler : AuthorizationHandler<ValidSessionRequirement>
    {
        protected override Task HandleRequirementAsync(AuthorizationHandlerContext context,
            ValidSessionRequirement requirement)
        {
            // exit Handler if Claim is not found
            if (!context.User.HasClaim(c => c.Type == ClaimTypes.NameIdentifier))
            {
                //TODO: Use the following if targeting a version of
                //.NET Framework older than 4.6:
                //      return Task.FromResult(0);
                return Task.CompletedTask;
            }

            
            string UserId = context.User.FindFirst(c => c.Type == ClaimTypes.NameIdentifier).Value;
            if (UserId == "")
            {
                context.Fail();
            }

            // check if UserId/session is in DB
            //if (calculatedAge >= requirement.MinimumAge)
            {
                context.Succeed(requirement);
            }

            //TODO: Use the following if targeting a version of
            //.NET Framework older than 4.6:
            //      return Task.FromResult(0);
            return Task.CompletedTask;
        }
    }
}
