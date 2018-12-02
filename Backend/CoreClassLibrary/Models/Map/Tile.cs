using System;

namespace CoreClassLibrary.Models.Map
{
    public class Tile
    {
        public int x;
        public int y;
        public int z;

        public string type {get; set;}

        public Tile(int x, int y, int z)
        {
            this.x = x;
            this.y = y;
            this.z = z;
        }

        public Tile(int x, int y, int z, string type)
        {
            this.x = x;
            this.y = y;
            this.z = z;

            this.type = type;
        }
    }

    public class ResourceTile : Tile
    {
        private string[] TileAttributesResourceTypeList = new string[]
        {
            "Gold",
            "Stone",
            "Pumpkin"
        };

        public struct ResourceContainer
        {
            public string type {get; set;}
            public float resource_volume {get; set;}
            public float degradation_rate {get; set;}
        }
        public ResourceContainer resource;

        public ResourceTile(int x, int y, int z, string type) : base(x, y, z, type)
        {

        }   

        public virtual void GetRndRessource()
        {
            Random rnd = new Random();

            this.resource.type = TileAttributesResourceTypeList[rnd.Next(TileAttributesResourceTypeList.Length)];
            this.resource.resource_volume = 50000 * rnd.Next(1, 3);

            switch (this.resource.type)
            {
                case "Gold":
                    this.resource.degradation_rate = 0.2f;
                    break;
                case "Stone":
                    this.resource.degradation_rate = 0.4f;
                    break;
                case "Pumpkin":
                    this.resource.degradation_rate = 0.6f;
                    break;      
                default:
                    break;
            }
        }
    }

    public class ForestTile : ResourceTile
    {
        public ForestTile(int x, int y, int z, string type) : base(x, y, z, type)
        {
            Random rnd = new Random();
                    
            this.resource.type = "Forest";
            this.resource.degradation_rate = 0.5f;
            this.resource.resource_volume = 10000 * rnd.Next(1, 3);

            this.type = "Resource";
        }

        public override void GetRndRessource()
        {

        }
    }

    public class GrasTile : Tile
    {
        public GrasTile(int x, int y, int z, string type) : base(x, y, z, type)
        {
            
        }
    }

    public class MountainTile : Tile
    {
        public MountainTile(int x, int y, int z, string type) : base(x, y, z, type)
        {
            
        }
    }
    
}