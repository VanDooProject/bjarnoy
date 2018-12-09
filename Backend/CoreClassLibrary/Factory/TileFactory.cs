using System;
using System.Collections.Generic;
using System.Numerics;
using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Factory
{
    public class TileFactory
    {
        private Dictionary<Type, double> probability;

        public TileFactory(Dictionary<Type, double> probability)
        {
            this.probability = probability;
        }
            
        public Tile GetRndBiomTileAtPosition(Vector3 position)
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
            return new GrasTile(position);
        }
    }
}