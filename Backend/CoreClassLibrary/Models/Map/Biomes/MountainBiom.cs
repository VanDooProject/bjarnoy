using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map.Biomes
{
    public class MountainBiom : Biom
    {
        public MountainBiom() : base()
        {
            this.attributes.description = "Mountain";
            this.attributes.probability.Add(typeof(ForestTile), 0.1);
            this.attributes.probability.Add(typeof(MountainTile), 0.6);
            this.attributes.probability.Add(typeof(ResourceTile), 0.1);
        }
    }
}