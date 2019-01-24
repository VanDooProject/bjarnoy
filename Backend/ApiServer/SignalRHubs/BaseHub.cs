using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ApiServer.SignalRHubs
{
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class BaseHub : Hub
    {
        public async Task SendMessage(
            string message)
        {
            await Clients.All.SendAsync("newMessage", "anonymous", message);
        }
    }
}
