namespace CoreClassLibrary.Models.Map
{
    public class Tile
    {
        public int x;
        public int y;
        public int z;

        public struct ResourceContainer
        {
            public string type {get; set;}
            public float resource_volume {get; set;}
            public float degradation_rate {get; set;}
        }
        public struct Attributes
        {
            public string type {get; set;}
            public ResourceContainer resource;
        }
        public Attributes attributes;

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

            this.attributes.type = type;
        }
    }
}