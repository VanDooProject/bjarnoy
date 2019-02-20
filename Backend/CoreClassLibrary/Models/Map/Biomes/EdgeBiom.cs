using CoreClassLibrary.Factory;
using CoreClassLibrary.Models.Map.Tiles;

namespace CoreClassLibrary.Models.Map.Biomes
{
    public class EdgeBiom : Biom
    {
        public EdgeBiom() : base()
        {
            this.tile_factory = new TileFactory(this.probability, typeof(GrassTile));
        }
    }
}