
using System;
using System.Collections.Generic;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map;
using log4net;
using MongoDB.Driver;

namespace CoreClassLibrary.Respository
{
    public class IslandRepository
    {
        private ILog logger = LogManager.GetLogger(typeof(IslandRepository));

        private readonly IMongoCollection<Island> collection;


        public IslandRepository()
        {
            this.collection = MongoCollectionFactory.Instance.Get<Island>();
        }


        public List<Island> All()
        {
            List<Island> islands = collection.Find(_ => true).ToList();

            logger.InfoFormat("found {0} islands", islands.Count);

            return islands;
        }

        public void Add(Island item)
        {
            collection.InsertOne(item);
        }
    }
}
