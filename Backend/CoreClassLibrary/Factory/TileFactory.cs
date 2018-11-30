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
            Tile tile = new Tile(x, y, z, type);
            if(tile.attributes.type == "Resource")
            {
                GetRndRessource(tile);
            }
            else if(tile.attributes.type == "Forest")
            {
                Random rnd = new Random();
                tile.attributes.resource.degradation_rate = 0.5f;
                tile.attributes.resource.resource_volume = 10000 * rnd.Next(1, 3);
            }
            return tile;
        }

        private void GetRndRessource(Tile tile)
        {
            Random rnd = new Random();

            tile.attributes.resource.type = TileAttributesResourceTypeList[rnd.Next(TileAttributesResourceTypeList.Length)];
            tile.attributes.resource.resource_volume = 50000 * rnd.Next(1, 3);

            switch (tile.attributes.resource.type)
            {
                case "Gold":
                    tile.attributes.resource.degradation_rate = 0.2f;
                    break;
                case "Stone":
                    tile.attributes.resource.degradation_rate = 0.4f;
                    break;
                case "Pumpkin":
                    tile.attributes.resource.degradation_rate = 0.6f;
                    break;      
                default:
                    break;
            }
        }

    }
}