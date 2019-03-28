using System.Collections.Generic;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Player;
using MongoDB.Bson;

namespace CoreClassLibrary.Respository
{
    public interface IPlayerRepository
    {
        void Add(Player item);
        List<Player> All();
        void Delete(Player item);
        Player Get(ObjectId Id);
        Player GetByDisplayName(string DisplayName);
        Player GetByPlayerId(string PlayerId);
        Player GetPlayerOwnedBy(UserModel user);
        void Replace(Player player);
        void ReplaceAwareOfResources(Player player);
    }
}