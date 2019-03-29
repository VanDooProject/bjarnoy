using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Controller;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.TechQueues;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace CoreClassLibrary.Factory
{
    class MongoCollectionFactory
    {
        private MongoClient client = null;
        private IMongoDatabase db = null;

        //#if DEBUG
        //        private string ServerUri = "mongodb://10.0.0.137:27017";
        //#else
        //        private string ServerUri = "mongodb://mongodb:27017";
        //#endif
        private string ServerUri = String.Format(
            "mongodb://{0}:{1}/?ServerSelectionTimeout={2}", // socketTimeoutMS={2}&amp;connectTimeoutMS={2}&amp;waitqueuetimeoutms={2}
            SettingsController.Instance.GetSettings().V1.MongoDatabaseServerAddress,
            SettingsController.Instance.GetSettings().V1.MongoDatabaseServerPort,
            // https://stackoverflow.com/questions/24825107/c-sharp-mongodb-driver-ignores-timeout-options <- token should be set for all request -> undoable
            SettingsController.Instance.GetSettings().V1.MongoDatabaseServerTimeoutSeconds
            );
        

        private string DatabaseName = "BrowsergameDatabase";


        private static readonly Lazy<MongoCollectionFactory> lazy =
            new Lazy<MongoCollectionFactory>(() => new MongoCollectionFactory());

        public static MongoCollectionFactory Instance { get { return lazy.Value; } }

        private MongoCollectionFactory()
        {
            // TODO: move this to proper place
            BsonClassMap.RegisterClassMap<ForestTile>();
            BsonClassMap.RegisterClassMap<GoldResourceTile>();
            BsonClassMap.RegisterClassMap<GrassTile>();
            BsonClassMap.RegisterClassMap<MountainTile>();
            BsonClassMap.RegisterClassMap<PumpkinResourceTile>();
            BsonClassMap.RegisterClassMap<ResourceTile>();
            BsonClassMap.RegisterClassMap<StoneResourceTile>();
            BsonClassMap.RegisterClassMap<WaterTile>();

            BsonClassMap.RegisterClassMap<EdgeTile>();
            BsonClassMap.RegisterClassMap<QuarterEdgeTile>();
            BsonClassMap.RegisterClassMap<HalfEdgeTile>();
            BsonClassMap.RegisterClassMap<TriQuarterEdgeTile>();

            BsonClassMap.RegisterClassMap<Tile>();

            BsonClassMap.RegisterClassMap<Biom>();
            BsonClassMap.RegisterClassMap<ForestBiom>();
            BsonClassMap.RegisterClassMap<GrasslandBiom>();
            BsonClassMap.RegisterClassMap<MountainBiom>();
            BsonClassMap.RegisterClassMap<SparseBiom>();
            BsonClassMap.RegisterClassMap<EdgeBiom>();


            BsonClassMap.RegisterClassMap<Queue>();
            BsonClassMap.RegisterClassMap<BuildingQueue>();


            BsonClassMap.RegisterClassMap<Building>();
            BsonClassMap.RegisterClassMap<Lumberjack>();
            BsonClassMap.RegisterClassMap<StorageHouse>();
        }



        public IMongoCollection<T> Get<T>(string forceName = "")
        {
            if (client == null || db == null)
            {
                client = new MongoClient(ServerUri);
                db = client.GetDatabase(DatabaseName);
            }

            string name = string.IsNullOrEmpty(forceName)? typeof(T).Name.ToLower() : forceName;

            return db.GetCollection<T>(name);
        }
    }
}
