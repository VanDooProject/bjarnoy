
using System;
using System.Collections.Generic;
using CoreClassLibrary.Exceptions;
using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Player;
using log4net;
using MongoDB.Bson;
using MongoDB.Driver;

namespace CoreClassLibrary.Respository
{
    public class PlayerRepository : IPlayerRepository
    {
        private readonly ILog logger = LogManager.GetLogger(typeof(PlayerRepository));

        private readonly IMongoCollection<Player> collection;


        public PlayerRepository()
        {
            this.collection = MongoCollectionFactory.Instance.Get<Player>();
        }

        public void Delete(Player item)
        {
            // Remove the object.
            var filter = Builders<Player>.Filter.Where(x => x._id == item._id);
            collection.DeleteOne(filter);
        }

        public Player Get(ObjectId Id)
        {
            return GetByPlayerId(Id.ToString());
        }

        public Player GetByDisplayName(string DisplayName)
        {
            var filter = Builders<Player>.Filter.Where(x => x.DisplayName == DisplayName);
            var result = collection.Find(filter).ToList();
            if (result.Count == 1)
            {
                Player player = result[0];
                return player;
            }
            else
            {
                return null;
            }
        }

        public Player GetPlayerOwnedBy(UserModel user)
        {
            var filter = Builders<Player>.Filter.ElemMatch(
                x => x.Permissions,
                p => p.User._id == user._id &
                     p.Permission == PlayerPermission.PermissionLevel.owner
                );
            var result = collection.Find(filter).ToList();
            if (result.Count == 1)
            {
                Player player = result[0];
                return player;
            }
            else
            {
                return null;
            }
        }

        public Player GetByPlayerId(string PlayerId)
        {
            ObjectId objectId = new ObjectId(PlayerId);
            var filter = Builders<Player>.Filter.Where(x => x._id.Equals(objectId));
            var result = collection.Find(filter).ToList();
            if (result.Count == 1)
            {
                Player player = result[0];
                return player;
            }
            else
            {
                return null;
            }
        }


        public List<Player> All()
        {
            List<Player> players = collection.Find(_ => true).ToList();

            logger.InfoFormat("found {0} players", players.Count);

            return players;
        }

        public void Add(Player item)
        {
            collection.InsertOne(item);
        }

        public void Replace(Player player)
        {
            var filter = Builders<Player>.Filter.Where(x => x._id.Equals(player._id));
            //var update = Builders<BsonDocument>.Update.Combine(user);

            collection.ReplaceOne(filter, player);
        }

        /// <summary>
        /// only replaces user when resources version matches
        /// </summary>
        /// <param name="player"></param>
        public void ReplaceAwareOfResources(Player player)
        {
            var filter = Builders<Player>.Filter.Where(
                x => x._id.Equals(player._id) & x.EntityResources.Version == player.EntityResources.Version - 1
                );

            var result = collection.ReplaceOne(filter, player);
            if (result.ModifiedCount != 1)
            {
                throw new UpdateResourceException("could not update player since there was a race condition when updating resources");
            }
        }
    }
}
