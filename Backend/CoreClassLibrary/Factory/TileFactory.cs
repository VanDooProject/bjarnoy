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

        private string[] TileAttributesResourceTypeList = new string[]
        {
            "Gold",
            "Stone",
            "Pumpkin"
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
                    GetRndRessource(resource_tile);
                    return resource_tile;

                default:
                    GrasTile gras_tile_def = new GrasTile(x, y, z, type);
                    return gras_tile_def;
            }
        }

        private void GetRndRessource(ResourceTile tile)
        {
            Random rnd = new Random();

            tile.resource.type = TileAttributesResourceTypeList[rnd.Next(TileAttributesResourceTypeList.Length)];
            tile.resource.resource_volume = 50000 * rnd.Next(1, 3);

            switch (tile.resource.type)
            {
                case "Gold":
                    tile.resource.degradation_rate = 0.2f;
                    break;
                case "Stone":
                    tile.resource.degradation_rate = 0.4f;
                    break;
                case "Pumpkin":
                    tile.resource.degradation_rate = 0.6f;
                    break;      
                default:
                    break;
            }
        }

    }
}