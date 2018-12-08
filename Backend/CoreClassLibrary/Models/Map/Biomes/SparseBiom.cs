using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map.Biomes
{
    public class SparseBiom : Biom
    {
        public SparseBiom() : base()
        {
            this.attributes.description = "Sparse";
            this.attributes.probability.Add(typeof(ForestTile), 0.05);
            this.attributes.probability.Add(typeof(MountainTile), 0.0);
            this.attributes.probability.Add(typeof(ResourceTile), 0.05);
        }
    }
}