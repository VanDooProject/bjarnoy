
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Exceptions;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Coordinates;
using CoreClassLibrary.Models.Map.Tiles;
using log4net;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace CoreClassLibrary.Respository
{
    public class IslandRepository : IIslandRepository
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
        /// gets islands *without* tiles
        /// </summary>
        /// <returns></returns>
        public List<Island> AllIslands()
        {
            List<Island> islands = islandCollection.Find(_ => true).ToList();

            logger.InfoFormat("found {0} islands", islands.Count);

            return islands;
        }

        public Island GetIslandById(ObjectId objectId)
        {
            var filter = Builders<Island>.Filter.Where(x => x._id.Equals(objectId));
            var result = islandCollection.Find(filter).ToList();
            if (result.Count == 1)
            {
                Island island = result[0];

                logger.InfoFormat("found island {0}", island.name);

                island.Tiles = AllTilesOfIsland(island);

                return island;
            }

            throw new GameException("island not found by ID");
            //return null;
        }

        public List<Tile> AllTilesOfIsland(Island island)
        {
            List<Tile> tiles = tileCollection.Find(t => t.IslandId.Id == island._id).ToList();

            logger.InfoFormat("found {0} tiles for island {1}", tiles.Count, island.name);

            Debug.Assert(tiles.Count > 0);

            return tiles;
        }

        public IEnumerable<Tile> AllTiles()
        {
            List<Tile> tiles = tileCollection.Find(_ => true).ToList();

            logger.InfoFormat("found {0} tiles", tiles.Count);

            return tiles;

        }

        public IEnumerable<Tile> GetTilesRange(HexCoordinates3D a, HexCoordinates3D b)
        {
            List<Tile> tiles = tileCollection.Find(t => t.Position.x > a.x && t.Position.y > a.y && t.Position.x < b.x && t.Position.y < b.y).ToList();

            logger.InfoFormat("found {0} tiles", tiles.Count);

            return tiles;

        }

        public void Add(Island island)
        {
            islandCollection.InsertOne(island);

            // set DB refs - so we can get corresponding islands for tiles later
            MongoDBRef mongoDbRef = createIslandDbRef(island);
            island.Tiles.ForEach(t => t.IslandId = mongoDbRef);

            tileCollection.InsertMany(island.Tiles);
        }

        public void AddTile(Tile tile)
        {
            tileCollection.InsertOne(tile);
        }

        public void AddTiles(List<Tile> tiles)
        {
            tileCollection.InsertMany(tiles);
        }

        public Tile getTile(float x, float y, float z)
        {
            var builder = Builders<Tile>.Filter;
            var filter = builder.Eq("Position.x", x) & builder.Eq("Position.y", y) & builder.Eq("Position.z", z);
            var result = tileCollection.Find(filter).ToList();

            Tile tile = result.FirstOrDefault();

            if (tile == null)
            {
                throw new IllegalTileException("tile not found");
            }

            return tile;
        }

        public void Delete(Island island)
        {
            var builder = Builders<Island>.Filter;
            var filter = builder.Eq("_id", island._id);

            islandCollection.DeleteOne(filter);

            this.DeleteTiles(island);
        }

        public void DeleteTiles(Island island)
        {
            var builder = Builders<Tile>.Filter;
            var filter = builder.Eq("IslandId", createIslandDbRef(island));

            //var res = tileCollection.Find(filter);
            //var r = res.ToList();
            tileCollection.DeleteMany(filter);
        }

        public void DeleteAllTiles()
        {
            var builder = Builders<Tile>.Filter;
            var filter = builder.Empty; // matches all

            tileCollection.DeleteMany(filter);
        }

        public void ReplaceTile(Tile tile)
        {
            var filter = Builders<Tile>.Filter.Where(x => x._id.Equals(tile._id));
            //var update = Builders<BsonDocument>.Update.Combine(user);

            tileCollection.ReplaceOne(filter, tile);
        }

        private MongoDBRef createIslandDbRef(Island island)
        {
            return new MongoDBRef(islandCollection.CollectionNamespace.CollectionName, island._id);
        }
    }
}
