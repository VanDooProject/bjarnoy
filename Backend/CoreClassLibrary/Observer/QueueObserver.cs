using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using System.Timers;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.TechQueues;
using CoreClassLibrary.Respository;
using log4net;
using MongoDB.Bson;
using MongoDB.Driver;

namespace CoreClassLibrary.Observer
{
    public class QueueObserver
    {
        private ILog logger = LogManager.GetLogger(typeof(QueueObserver));

        private readonly IMongoCollection<Queue> collection;

        private static readonly Lazy<QueueObserver> lazy =
            new Lazy<QueueObserver>(() => new QueueObserver());

        public static QueueObserver Instance { get { return lazy.Value; } }

        public QueueObserver()
        {
            logger.Info("observer started");

            this.collection = MongoCollectionFactory.Instance.Get<Queue>();

            //#if DEBUG
            // in debug build use polling
            var timer = new System.Timers.Timer(2000);
            timer.Elapsed += OnTimerEvent;
            timer.AutoReset = true;
            timer.Enabled = true;
            //#endif


            /* // TODO: use change streams to proper poll in release build

            // https://stackoverflow.com/questions/48672584/how-to-set-mongodb-change-stream-operationtype-in-the-c-sharp-driver

            //Get the whole document instead of just the changed portion
            ChangeStreamOptions options = new ChangeStreamOptions() { FullDocument = ChangeStreamFullDocumentOption.UpdateLookup };


            //The operationType can be one of the following: insert, update, replace, delete, invalidate
            var pipeline = new EmptyPipelineDefinition<ChangeStreamDocument<Queue>>()
                .Match("{ operationType: { $in: [ 'replace', 'insert', 'update' ] } }");

            var changeStream = collection.Watch(pipeline,options);
            //changeStream.MoveNext();    //Blocks until a document is replaced, inserted or updated in the TestCollection
            //IEnumerable<ChangeStreamDocument<Queue>> next = changeStream.Current;
            //enumerator.Dispose();

            changeStream.ForEachAsync(Processor);
            */


        }

        private void OnTimerEvent(object sender, ElapsedEventArgs e)
        {
            // query all finished queue entries and call clb
            QueueRepository queueRepository = new QueueRepository();
            List<Queue> list = queueRepository.GetAndRemoveFinished();

            foreach (Queue queue in list)
            {
                processQueueEntry(queue);
            }
        }

        private Task Processor(ChangeStreamDocument<Queue> arg1, int arg2)
        {
            return null;
        }



        private Task processQueueEntry(Queue entry)
        {
            logger.InfoFormat("processing queue {0}", entry);
            return null;
        }
    }
}
