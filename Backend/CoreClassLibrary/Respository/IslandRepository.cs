
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
            var filter = builder.Eq("bioms.tiles.Position.X", x) & builder.Eq("bioms.tiles.Position.Y", y) & builder.Eq("bioms.tiles.Position.Z", z);
            var projection = Builders<Island>.Projection.Include("bioms.$.tiles");
            var result = collection.Find(filter).Project(projection).ToList();

            if (result.Count == 1)
            {
                var island = BsonSerializer.Deserialize<Island>(result.First());

                Debug.Assert(island.bioms.Count == 1);
                Biom biom = island.bioms.First(); // mongo should give us only one biom

                List<Tile> biomTiles = biom.tiles;
                Debug.Assert(biom.tiles.Count >= 1);

                Vector3 position = new Vector3(x, y, z);

                IEnumerable<Tile> tiles = biomTiles.Where(
                        t => Vector3.DistanceSquared(t.Position, position) <= SettingsController.Instance.GetSettings().V1.Vector3EqualsAllowedDistanceDisturbance
                    );

                //var ts = tiles.ToList(); // <- debuggable list

                return tiles.FirstOrDefault();
            }

            return null;
        }
    }
}
