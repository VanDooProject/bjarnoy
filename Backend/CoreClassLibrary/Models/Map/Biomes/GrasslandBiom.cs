using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map.Biomes
{
    public class GrasslandBiom : Biom
    {
        public GrasslandBiom() : base()
        {
            this.attributes.description = "Grassland";
            this.attributes.probability.Add(typeof(ForestTile), 0.1);
            this.attributes.probability.Add(typeof(MountainTile), 0.1);
            this.attributes.probability.Add(typeof(ResourceTile), 0.1);
        }
    }
}