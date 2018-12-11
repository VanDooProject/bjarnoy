using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Numerics;

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

        public class ResourceContainer
        {
            [JsonConverter(typeof(StringEnumConverter))]
            public TileAttributesResourceTypeList Type {get; set;}
            public float ResourceVolume {get; set;}
            public float DegradationRate {get; set;}
        }
        public ResourceContainer Resource = new ResourceContainer();

        public ResourceTile() : base()
        {
            GetRndResource();
        }

        public bool isResourceTile
        {
            get { return (this as ResourceTile) != null; }
        }

        public ResourceTile(Vector3 position) : base(position)
        {
            GetRndResource();
        }   

        public virtual void GetRndResource()
        {
            Random rnd = new Random();
            var temp_enum_list = Enum.GetValues(typeof(TileAttributesResourceTypeList));
            this.Resource.Type = (TileAttributesResourceTypeList)temp_enum_list.GetValue(rnd.Next(temp_enum_list.Length));
            this.Resource.ResourceVolume = 50000 * rnd.Next(1, 3);

            switch (this.Resource.Type)
            {
                case TileAttributesResourceTypeList.Gold:
                    this.Resource.DegradationRate = 0.2f;
                    break;
                case TileAttributesResourceTypeList.Pumpkin:
                    this.Resource.DegradationRate = 0.4f;
                    break;
                case TileAttributesResourceTypeList.Stone:
                    this.Resource.DegradationRate = 0.6f;
                    break;      
                default:
                    this.Resource.DegradationRate = 0.5f;
                    break;
            }
        }
    }
}