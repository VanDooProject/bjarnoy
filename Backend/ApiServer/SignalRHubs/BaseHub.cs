using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using log4net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ApiServer.SignalRHubs
{
    [Authorize]
    public class BaseHub : Hub
    {
        private ILog logger = LogManager.GetLogger(typeof(BaseHub));

        public override Task OnConnectedAsync()
        {
            logger.InfoFormat("client {0} connected", Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            return base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception exception)
        {
            logger.Info("client disconnected");
            return base.OnDisconnectedAsync(exception);
        }

        public async Task SendMessage(string message)
        {
            logger.Info($"got message {message}");
            await Clients.All.SendAsync("ReceiveMessage", message);
        }

        public DateTime GetServerTime()
        {
            logger.Info($"requested servertime");
            return DateTime.Now;
        }

    }
}
