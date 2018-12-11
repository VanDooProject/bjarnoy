using System.Collections.Generic;
using System.Numerics;
using CoreClassLibrary.Models.Generic;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Serializer;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Map
{
    public class Island : MongoEntity
    {
        public string name { get; set; }
        public int size;
        public List<Biom> bioms = new List<Biom>();

        [BsonSerializer(typeof(Vector3Serializer))]
        public Vector3 StartPosition;

        public Island(Vector3 startPosition)
        {
            this.StartPosition = startPosition;
        }

        private List<Tile> _tiles = new List<Tile>();
        [JsonIgnore]
        [BsonIgnore]
        public List<Tile> Tiles
        {
            get
            {
                _tiles.Clear();
                foreach(Biom b in this.bioms)
                {
                    foreach(Tile t in b.tiles)
                    {
                        this._tiles.Add(t);
                    }
                }
                //this.bioms.ForEach(b => b.tiles.ForEach(t => _tiles.Add(t)));

                return this._tiles;
            }
        }
    }
}