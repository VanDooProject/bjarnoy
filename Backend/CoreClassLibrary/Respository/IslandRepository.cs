
using System;
using System.Collections.Generic;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;
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

        public Tile getTile(float x, float y, float z)
        {
            var builder = Builders<Island>.Filter;
            var filter = builder.Eq("bioms.tiles.Position.X", 10);
            var result = collection.Find(filter).ToList();

            if (result.Count == 1)
            {
                //return result[0].Tiles[0];
            }

            return null;
        }
    }
}
