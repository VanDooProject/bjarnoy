using System;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Factory
{
    public class TileFactory
    {
        public enum TileAttributesGeneralTypeList  
        {
            gras = 1,
            mountain = 2,
            forest = 3,
            resource = 4,
        };

        public Tile GetNewSpecificTile(int x, int y, int z, TileAttributesGeneralTypeList type)
        {
            switch (type)
            {
                case TileAttributesGeneralTypeList.gras:
                    return new GrasTile(x, y, z);

                case TileAttributesGeneralTypeList.mountain:
                    return new MountainTile(x, y, z);

                case TileAttributesGeneralTypeList.forest:
                    return new ForestTile(x, y, z);

                case TileAttributesGeneralTypeList.resource:
                    ResourceTile resource_tile = new ResourceTile(x, y, z);
                    resource_tile.GetRndRessource();
                    return resource_tile;

                default:
                    return new GrasTile(x, y, z);
            }
        }
    }
}