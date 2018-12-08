using System;

namespace CoreClassLibrary.Models.Map.Tiles
{
    public class ResourceTile : Tile
    {
        public enum TileAttributesResourceTypeList
        {
            Gold = 1,
            Stone = 2,
            Pumpkin = 3,
        };

        public struct ResourceContainer
        {
            public TileAttributesResourceTypeList type {get; set;}
            public float resource_volume {get; set;}
            public float degradation_rate {get; set;}
        }
        public ResourceContainer resource;

        public ResourceTile() : base()
        {
        }


        public bool isResourceTile
        {
            get { return (this as ResourceTile) != null; }
        }

        public ResourceTile(int x, int y, int z) : base(x, y, z)
        {
        }   

        public virtual void GetRndRessource()
        {
            Random rnd = new Random();
            var temp_enum_list = Enum.GetValues(typeof(TileAttributesResourceTypeList));
            this.resource.type = (TileAttributesResourceTypeList)temp_enum_list.GetValue(rnd.Next(temp_enum_list.Length));
            this.resource.resource_volume = 50000 * rnd.Next(1, 3);

            switch (this.resource.type)
            {
                case TileAttributesResourceTypeList.Gold:
                    this.resource.degradation_rate = 0.2f;
                    break;
                case TileAttributesResourceTypeList.Pumpkin:
                    this.resource.degradation_rate = 0.4f;
                    break;
                case TileAttributesResourceTypeList.Stone:
                    this.resource.degradation_rate = 0.6f;
                    break;      
                default:
                    this.resource.degradation_rate = 0.5f;
                    break;
            }
        }
    }
}