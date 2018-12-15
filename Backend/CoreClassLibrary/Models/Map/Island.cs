using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
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
        
        [JsonIgnore]
        [BsonIgnore]
        public List<Tile> Tiles
        {
            get
            {
                List<Tile> _tiles = new List<Tile>();
                foreach(Biom b in this.bioms)
                {
                    foreach(Tile t in b.tiles)
                    {
                        _tiles.Add(t);
                    }
                }
                //this.bioms.ForEach(b => b.tiles.ForEach(t => _tiles.Add(t)));

                return _tiles;
            }
        }



        public List<Tile> getNeighbors(Vector3 pos)
        {
            List<Tile> tiles = new List<Tile>();

            for (float x = pos.X - 1; x <= pos.X + 1; x++)
            {
                for (float y = pos.Y - 1; y <= pos.Y + 1; y++)
                {
                    Tile neighbor = this.getTile(new Vector3(x, y, pos.Z));
                    if (neighbor != null)
                    {
                        tiles.Add(neighbor);
                    }
                }
            }

            return tiles;
        }

        public List<Tile> getNeighbors(Tile tile)
        {
            return this.getNeighbors(tile.Position);
        }


        public List<Vector3> getFreeNeighbors(Tile tile)
        {
            List<Vector3> positions = new List<Vector3>();

            for (float x = tile.Position.X - 1; x <= tile.Position.X + 1; x++)
            {
                for (float y = tile.Position.Y - 1; y <= tile.Position.Y + 1; y++)
                {
                    Tile neighbor = this.getTile(new Vector3(x, y, tile.Position.Z));
                    if (neighbor == null)
                    {
                        positions.Add(new Vector3(x, y, tile.Position.Z));
                    }
                }
            }

            return positions;
        }



        public Tile getTile(Vector3 pos)
        {
            Biom biom = this.bioms.FirstOrDefault(b => b.tiles.Any(t => t.CheckIfSameTile(pos)));
            if (biom == null)
            {
                // tile not found
                return null;
            }

            List<Tile> biomTiles = biom.tiles;
            Debug.Assert(biom.tiles.Count >= 1);

            Tile tile = biomTiles.FirstOrDefault(t => t.CheckIfSameTile(pos));

            return tile;
        }
    }
}