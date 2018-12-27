using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.TechQueues;
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
        }

        private Task Processor(ChangeStreamDocument<Queue> arg1, int arg2)
        {
            return null;
        }
    }
}
