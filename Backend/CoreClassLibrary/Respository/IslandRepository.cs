
using System;
using System.Collections.Generic;
using System.Linq;
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
            var filter = builder.Eq("bioms.tiles.Position.X", x);
            var projection = Builders<Island>.Projection.Include("bioms.$.tiles");
            var result = collection.Find(filter).Project(projection).ToList();

            if (result.Count == 1)
            {
                var res = BsonSerializer.Deserialize<Island>(result.First());
                //var ret = res.bioms.Where(b => b.tiles.Any(t => t.Position.X == 10));
                Biom biom = res.bioms.First();
                List<Tile> biomTiles = biom.tiles;
                //IEnumerable<Tile> tiles = biomTiles.Where(t => (t.Position.X+0.0001) >= x && (t.Position.X - 0.0001) <= x);
                IEnumerable<Tile> tiles = biomTiles.Where(t => Math.Abs(t.Position.X - x) < 0.0001);

                var ts = tiles.ToList();

                return tiles.FirstOrDefault();
                //return result[0].Tiles[0];
            }

            return null;
        }
    }
}
