using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map.Biomes
{
    public class GrasslandBiom : Biom
    {
        public GrasslandBiom() : base()
        {
            this.probability.Add(typeof(ForestTile), 0.1);
            this.probability.Add(typeof(MountainTile), 0.1);
            this.probability.Add(typeof(PumpkinResourceTile), 0.1);
            this.tile_factory = new TileFactory(this.probability, typeof(GrassTile));
        }
    }
}