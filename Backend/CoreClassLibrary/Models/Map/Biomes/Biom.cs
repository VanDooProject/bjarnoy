using System;
using System.Collections.Generic;
using System.Numerics;
using System.Reflection;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Factory;
using static CoreClassLibrary.Factory.TileFactory;
using System.Linq;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace CoreClassLibrary.Models.Map.Biomes
{
    //[BsonKnownTypes(typeof(ForestBiom), typeof(GrasslandBiom), typeof(MountainBiom), typeof(SparseBiom)]
    public class Biom
    {
        public List<Tile> tiles = new List<Tile>();

        [JsonIgnore]
        [BsonIgnore]
        public Dictionary<Type, double> probability;
        public string description
        {
            get { return this.GetType().ToString().Split('.').Last().Split('+').First(); }
        }

        [JsonIgnore]
        [BsonIgnore]
        public TileFactory tile_factory;

        public Biom()
        {
            this.probability = new Dictionary<Type, double>();
        }

        public void AddRndBiomTileAtPosition(Vector3 position)
        {
            tiles.Add(tile_factory.GetRndBiomTileAtPosition(position));
        }
    }
}