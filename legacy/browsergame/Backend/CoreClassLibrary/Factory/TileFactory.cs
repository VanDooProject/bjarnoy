using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Coordinates;
using CoreClassLibrary.Models.Map.Tiles;
using Newtonsoft.Json;

namespace CoreClassLibrary.Factory
{
    public class TileFactory
    {
        public Type defaultType;
        private Dictionary<Type, double> probability;

        public TileFactory(Dictionary<Type, double> probability, Type defaultType)
        {
            this.probability = probability;
            this.defaultType = defaultType;
        }
            
        public Tile GetRndBiomTileAtPosition(HexCoordinates3D position)
        {
            Random rnd = new Random();
            double rnd_value = rnd.NextDouble();

            double cumulative_probability = 0.0;
            foreach (KeyValuePair<Type, double> probability in this.probability)
            {
                cumulative_probability = cumulative_probability + probability.Value;
                if (rnd_value < cumulative_probability)
                {
                    return (Tile)Activator.CreateInstance(probability.Key, position);
                }
            }
            return (Tile)Activator.CreateInstance(this.defaultType, position);
        }
    }
}