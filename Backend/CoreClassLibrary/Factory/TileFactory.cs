using System;
using System.Numerics;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Factory
{
    public class TileFactory
    {
        public enum TileAttributesGeneralTypeList  //ToDo: change to list/dicrectory.
        {
            gras = 1,
            mountain = 2,
            forest = 3,
            resource = 4,
        };

        public Tile GetNewSpecificTile(Vector3 position, TileAttributesGeneralTypeList type)
        {
            switch (type)
            {
                case TileAttributesGeneralTypeList.gras:
                    return new GrasTile(position);

                case TileAttributesGeneralTypeList.mountain:
                    return new MountainTile(position);

                case TileAttributesGeneralTypeList.forest:
                    return new ForestTile(position);

                case TileAttributesGeneralTypeList.resource:
                    ResourceTile resource_tile = new ResourceTile(position);
                    resource_tile.GetRndResource();
                    return resource_tile;

                default:
                    return new GrasTile(position);
            }
        }
    }
}