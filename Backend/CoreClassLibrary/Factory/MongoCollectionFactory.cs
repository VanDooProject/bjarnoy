using System;
using System.Collections.Generic;
using System.Text;
using MongoDB.Driver;

namespace CoreClassLibrary.Factory
{
    class MongoCollectionFactory
    {
        private MongoClient client = null;
        private IMongoDatabase db = null;

#if DEBUG
        private string ServerUri = "mongodb://10.0.0.137:27017";
#else
        private string ServerUri = "mongodb://mongodb:27017";
#endif

        private string DatabaseName = "BrowsergameDatabase";


        private static readonly Lazy<MongoCollectionFactory> lazy =
            new Lazy<MongoCollectionFactory>(() => new MongoCollectionFactory());

        public static MongoCollectionFactory Instance { get { return lazy.Value; } }

        private MongoCollectionFactory()
        {
        }



        public IMongoCollection<T> Get<T>()
        {
            if (client == null || db == null)
            {
                client = new MongoClient(ServerUri);
                db = client.GetDatabase(DatabaseName);
            }

            string name = typeof(T).Name.ToLower();

            return db.GetCollection<T>(name);
        }
    }
}
