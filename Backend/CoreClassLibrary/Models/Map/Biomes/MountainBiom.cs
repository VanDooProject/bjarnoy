using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map.Biomes
{
    public class MountainBiom : Biom
    {
        public MountainBiom() : base()
        {
            this.probability.Add(typeof(ForestTile), 0.1);
            this.probability.Add(typeof(MountainTile), 0.6);
            this.probability.Add(typeof(ResourceTile), 0.1);
            this.tile_factory = new TileFactory(this.probability, typeof(GrasTile));
        }
    }
}