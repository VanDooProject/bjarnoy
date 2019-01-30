using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ApiServer.SignalRHubs;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Observer;
using log4net;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace ApiServer.BackgroundService
{
    // https://github.com/davidfowl/UT3/blob/fb12e182d42d2a5a902c1979ea0e91b66fe60607/UTT/Scavenger.cs#L9-L40
    public class QueueObserverService : Microsoft.Extensions.Hosting.BackgroundService
    {
        private ILog logger = LogManager.GetLogger(typeof(QueueObserverService));
        private readonly IHubContext<BaseHub> _hubContext;
        private QueueObserver _queueObserver;

        public QueueObserverService(IHubContext<BaseHub> hubContext)
        {
            _hubContext = hubContext;

            _queueObserver = new QueueObserver(QueueEntryProcessedCallback);
        }

        private void QueueEntryProcessedCallback(Queue q)
        {
            string userId = q.Owner._id.ToString();
            logger.DebugFormat("Notify '{0}' #{1} for {2}", q.Owner.Username, userId, q);


            // send notification to all affected users
            _hubContext.Clients.User(userId).SendAsync("Queue", $"{q} done");
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                _queueObserver.GetAndProcessEntries();

                // rate limiting
                await Task.Delay(200);
            }
        }
    }
}
