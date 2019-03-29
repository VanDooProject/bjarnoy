using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Timers;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.QueueHandler;
using CoreClassLibrary.Respository;
using log4net;
using MongoDB.Bson;
using MongoDB.Driver;

namespace CoreClassLibrary.Observer
{
    public partial class QueueObserver
    {
        private ILog logger = LogManager.GetLogger(typeof(QueueObserver));


        private BuildQueueHandler BuildHandler = new BuildQueueHandler();

        private QueueRepository queueRepository = new QueueRepository();


        public delegate void EntryProcessedDelegate(Queue q);

        private EntryProcessedDelegate _callback;

        public QueueObserver(EntryProcessedDelegate clb = null)
        {
            logger.Info("observer started");

            if (clb != null)
            {
                _callback = clb;
            }
        }



        public void GetAndProcessEntries()
        {
            // do while there are entries
            Queue entry;
            while ((entry = queueRepository.GetAndUpdateFinished()) != null)
            {
                try
                {
                    processQueueEntry(entry);

                    queueRepository.MarkAsProcessed(entry);
                    _callback(entry);
                }
                catch (QueueNotImplementedException e)
                {
                    logger.Error(e.Message);
                }
            }
        }



        private void processQueueEntry(Queue entry)
        {
            logger.InfoFormat("processing queue {0}", entry);

            if (entry is BuildingQueue buildEntry)
            {
                BuildHandler.processEntry(buildEntry);
            }
            else
            {
                throw new QueueNotImplementedException("this queue entry is not implemented yet " + entry);
            }
        }
    }
}
