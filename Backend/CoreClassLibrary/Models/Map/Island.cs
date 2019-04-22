using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Models.Generic;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Coordinates;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Serializer;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Map
{
    public class Island : MongoEntity
    {
        public string name { get; set; }

        [JsonIgnore] // there is no need for the Frontend to know this
        public int size { get; set; }


        [JsonIgnore] // since we only use bioms to create islands -> no return to user interface of bioms
        public List<Biom> bioms = new List<Biom>();

        //[BsonSerializer(typeof(Vector3Serializer))]
        public HexCoordinates3D StartPosition;

        public Island(HexCoordinates3D startPosition)
        {
            this.StartPosition = startPosition;
        }
        
        //[JsonIgnore] // since we removed bioms from DB
        [BsonIgnore]
        public List<Tile> Tiles { get; set; } = new List<Tile>();
        //{
        //    get
        //    {
        //        List<Tile> _tiles = new List<Tile>();
        //        foreach(Biom b in this.bioms)
        //        {
        //            foreach(Tile t in b.tiles)
        //            {
        //                _tiles.Add(t);
        //            }
        //        }
        //        //this.bioms.ForEach(b => b.tiles.ForEach(t => _tiles.Add(t)));
        //
        //        return _tiles;
        //    }
        //}


        /// <summary>
        /// gets neighbors in given range
        /// 
        /// https://www.redblobgames.com/grids/hexagons/#range
        /// </summary>
        /// <param name="pos"></param>
        /// <param name="distance"></param>
        /// <returns></returns>
        public List<Tile> getRange(HexCoordinates3D pos, int distance)
        {
            List<Tile> tiles = new List<Tile>();

            for (int x = -distance; x <= +distance; x++)
            {
                for (int y = Math.Max(-distance, -x-distance); y <= Math.Min(+distance, -x+distance); y++)
                {
                    Tile neighbor = this.getTile(new HexCoordinates3D(pos.x + x, pos.y + y));
                    if (neighbor != null)
                    {
                        tiles.Add(neighbor);
                    }
                }
            }

            return tiles;
        }

        public List<Tile> getRange(Tile tile, int distance)
        {
            return this.getRange(tile.Position, distance);
        }


        public List<Tile> getNeighbors(HexCoordinates3D pos)
        {
            List<Tile> tiles = new List<Tile>();

            for (int x = pos.x - 1; x <= pos.x + 1; x++)
            {
                for (int y = pos.y - 1; y <= pos.y + 1; y++)
                {
                    Tile neighbor = this.getTile(new HexCoordinates3D(x, y));
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


        public List<HexCoordinates3D> getFreeNeighbors(Tile tile)
        {
            List<HexCoordinates3D> positions = new List<HexCoordinates3D>();

            for (int x = tile.Position.x - 1; x <= tile.Position.x + 1; x++)
            {
                for (int y = tile.Position.y - 1; y <= tile.Position.y + 1; y++)
                {
                    Tile neighbor = this.getTile(new HexCoordinates3D(x, y));
                    if (neighbor == null)
                    {
                        positions.Add(new HexCoordinates3D(x, y));
                    }
                }
            }

            return positions;
        }



        public Tile getTile(HexCoordinates3D pos)
        {
            // Biom biom = this.bioms.FirstOrDefault(b => b.tiles.Any(t => t.CheckIfSameTile(pos)));
            // if (biom == null)
            // {
            //     // tile not found
            //     return null;
            // }
            // 
            // List<Tile> biomTiles = biom.tiles;
            // Debug.Assert(biom.tiles.Count >= 1);

            // don't use bioms for this, we have full list of tiles in island
            List<Tile> biomTiles = this.Tiles;

            Tile tile = biomTiles.FirstOrDefault(t => t.CheckIfSameTile(pos));

            return tile;
        }
    }
}