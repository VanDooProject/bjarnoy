using System;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Factory
{
    public class TileFactory
    {
        public enum TileAttributesGeneralTypeList  
        {
            Gras = 1,
            Mountain = 2,
            Forest = 3,
            Resource = 4,
        };

        public Tile GetNewSpecificTile(int x, int y, int z, TileAttributesGeneralTypeList type)
        {
            switch (type)
            {
                case TileAttributesGeneralTypeList.Gras:
                    return new GrasTile(x, y, z);

                case TileAttributesGeneralTypeList.Mountain:
                    return new MountainTile(x, y, z);

                case TileAttributesGeneralTypeList.Forest:
                    return new ForestTile(x, y, z);

                case TileAttributesGeneralTypeList.Resource:
                    ResourceTile resource_tile = new ResourceTile(x, y, z);
                    resource_tile.GetRndRessource();
                    return resource_tile;

                default:
                    return new GrasTile(x, y, z);
            }
        }
    }
}