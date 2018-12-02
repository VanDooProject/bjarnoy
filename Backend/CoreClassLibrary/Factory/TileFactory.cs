using System;
using CoreClassLibrary.Models.Map;

namespace CoreClassLibrary.Factory
{
    public class TileFactory
    {
        private string[] TileAttributesGeneralTypeList = new string[]
        {
            "Gras",
            "Mountain",
            "Forest",
            "Resource"
        };

        public Tile GetNewSpecificTile(int x, int y, int z, string type)
        {
            switch (type)
            {
                case "Gras":
                    GrasTile gras_tile = new GrasTile(x, y, z, type);
                    return gras_tile;

                case "Mountain":
                    MountainTile mountain_tile = new MountainTile(x, y, z, type);
                    return mountain_tile;

                case "Forest":
                    ForestTile forest_tile = new ForestTile(x, y, z, type);
                    return forest_tile;

                case "Resource":
                    ResourceTile resource_tile = new ResourceTile(x, y, z, type);
                    resource_tile.GetRndRessource();
                    return resource_tile;

                default:
                    GrasTile gras_tile_def = new GrasTile(x, y, z, type);
                    return gras_tile_def;
            }
        }
    }
}