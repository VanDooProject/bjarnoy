
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using log4net;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace CoreClassLibrary.Respository
{
    public class IslandRepository
    {
        private ILog logger = LogManager.GetLogger(typeof(IslandRepository));

        private readonly IMongoCollection<Island> islandCollection;
        private readonly IMongoCollection<Tile> tileCollection;


        public IslandRepository()
        {
            this.islandCollection = MongoCollectionFactory.Instance.Get<Island>();
            this.tileCollection = MongoCollectionFactory.Instance.Get<Tile>();
        }

        /// <summary>
        /// gets tiles *without* islands
        /// </summary>
        /// <returns></returns>
        public List<Island> AllIslands()
        {
            List<Island> islands = islandCollection.Find(_ => true).ToList();

            logger.InfoFormat("found {0} islands", islands.Count);

            return islands;
        }

        public IEnumerable<Tile> AllTiles()
        {
            List<Tile> tiles = tileCollection.Find(_ => true).ToList();

            logger.InfoFormat("found {0} tiles", tiles.Count);

            return tiles;

        }

        public void Add(Island island)
        {
            islandCollection.InsertOne(island);

            // set DB refs - so we can get corresponding islands for tiles later
            island.Tiles.ForEach(t => t.IslandId = new MongoDBRef(islandCollection.CollectionNamespace.CollectionName, island._id));

            tileCollection.InsertMany(island.Tiles);
        }
        
        public Tile getTile(float x, float y, float z)
        {
            var builder = Builders<Tile>.Filter;
            var filter = builder.Eq("Position.X", x) & builder.Eq("Position.Y", y) & builder.Eq("Position.Z", z);
            var result = tileCollection.Find(filter).ToList();

            return result.FirstOrDefault();
        }

        public void ReplaceTile(Tile tile)
        {
            var filter = Builders<Tile>.Filter.Where(x => x._id.Equals(tile._id));
            //var update = Builders<BsonDocument>.Update.Combine(user);

            tileCollection.ReplaceOne(filter, tile);
        }
    }
}
