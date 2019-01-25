using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using log4net;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ApiServer.SignalRHubs
{
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class BaseHub : Hub
    {
        private ILog logger = LogManager.GetLogger(typeof(BaseHub));

        public override Task OnConnectedAsync()
        {
            logger.Info("client connected");
            return base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception exception)
        {
            logger.Info("client disconnected");
            return base.OnDisconnectedAsync(exception);
        }

        public async Task SendMessage(
            string message)
        {
            logger.Info($"got message {message}");
            await Clients.All.SendAsync("newMessage", "anonymous", message);
        }


    }
}
