using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map.Biomes
{
    public class SparseBiom : Biom
    {
        public SparseBiom() : base()
        {
            this.probability.Add(typeof(ForestTile), 0.05);
            this.probability.Add(typeof(MountainTile), 0.0);
            this.probability.Add(typeof(PumpkinResourceTile), 0.05);
            this.tile_factory = new TileFactory(this.probability, typeof(GrassTile));
        }
    }
}