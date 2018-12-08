using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map.Biomes
{
    public class ForestBiom : Biom
    {
        public ForestBiom() : base()
        {
            this.attributes.description = "Forest";
            this.attributes.probability.Add(typeof(ForestTile), 0.6);
            this.attributes.probability.Add(typeof(MountainTile), 0.1);
            this.attributes.probability.Add(typeof(ResourceTile), 0.1);
        }
    }
}