
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.TechQueues;
using log4net;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace CoreClassLibrary.Respository
{
    public class QueueRepository
    {
        private ILog logger = LogManager.GetLogger(typeof(QueueRepository));

        private readonly IMongoCollection<Queue> collection;


        public QueueRepository()
        {
            this.collection = MongoCollectionFactory.Instance.Get<Queue>();
        }

        public void Add(Queue queue)
        {
            collection.InsertOne(queue);
        }

        public List<Queue> AllUnprocessedByUser(UserModel user)
        {
            var builder = Builders<Queue>.Filter;
            var filter = builder.Eq("Owner._id", user._id) & builder.Eq("Processing", Queue.eQueueProcessingState.unprocessed);
            return collection.Find(filter).ToList();
        }

        public Queue GetAndUpdateFinished()
        {
            var builder = Builders<Queue>.Filter;

            var filter = builder.Lt("EndTime", DateTime.Now) & builder.Eq("Processing", Queue.eQueueProcessingState.unprocessed);
            var update = Builders<Queue>.Update.Set(x => x.Processing, Queue.eQueueProcessingState.processing);

            return collection.FindOneAndUpdate(filter, update);
        }

        public Queue MarkAsProcessed(Queue entry)
        {
            var builder = Builders<Queue>.Filter;

            var filter = builder.Eq("_id", entry._id);
            var update = Builders<Queue>.Update.Set(x => x.Processing, Queue.eQueueProcessingState.processed);

            return collection.FindOneAndUpdate(filter, update);
        }
    }
}
