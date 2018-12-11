
using System;
using System.Collections.Generic;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Auth;
using log4net;
using MongoDB.Bson;
using MongoDB.Driver;

namespace CoreClassLibrary.Respository
{
    public class UserRepository
    {
        private ILog logger = LogManager.GetLogger(typeof(UserRepository));

        private IMongoCollection<UserModel> collection;


        public UserRepository()
        {
            this.collection = MongoCollectionFactory.Instance.Get<UserModel>();
        }

        public void Delete(UserModel item)
        {
            // Remove the object.
            var filter = Builders<UserModel>.Filter.Where(x => x._id == item._id);
            collection.DeleteOne(filter);
        }

        public UserModel Get(ObjectId Id)
        {
            return GetByUserId(Id.ToString());
        }

        public UserModel GetByUsername(string loginUsername)
        {
            var filter = Builders<UserModel>.Filter.Where(x => x.Username == loginUsername);
            var result = collection.Find(filter).ToList();
            if (result.Count == 1)
            {
                UserModel User = result[0];
                return User;
            }
            else
            {
                return null;
            }
        }

        public UserModel GetByUserId(string userId)
        {
            ObjectId objectId = new ObjectId(userId);
            var filter = Builders<UserModel>.Filter.Where(x => x._id.Equals(objectId));
            var result = collection.Find(filter).ToList();
            if (result.Count == 1)
            {
                UserModel User = result[0];
                return User;
            }
            else
            {
                return null;
            }
        }


        public List<UserModel> All()
        {
            List<UserModel> usersList = collection.Find(_ => true).ToList();

            logger.InfoFormat("found {0} users", usersList.Count);

            return usersList;
        }

        public void Add(UserModel item)
        {
            collection.InsertOne(item);
        }

        public void Replace(UserModel user)
        {
            var filter = Builders<UserModel>.Filter.Where(x => x._id.Equals(user._id));
            //var update = Builders<BsonDocument>.Update.Combine(user);

            collection.ReplaceOne(filter, user);
        }
    }
}
