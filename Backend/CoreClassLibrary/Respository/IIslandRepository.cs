using System.Collections.Generic;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Respository
{
    public interface IIslandRepository
    {
        void Add(Island island);
        List<Island> AllIslands();
        IEnumerable<Tile> AllTiles();
        void Delete(Island island);
        void DeleteTiles(Island island);
        Tile getTile(float x, float y, float z);
        void ReplaceTile(Tile tile);
    }
}