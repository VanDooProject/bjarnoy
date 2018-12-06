namespace CoreClassLibrary.Models.Map.Biomes
{
    public class GrasslandBiom : Biom
    {
        public GrasslandBiom() : base()
        {
            this.attributes.type.description = "Grassland";
            this.attributes.type.probability.forest = 0.1f;
            this.attributes.type.probability.mountain = 0.1f;
            this.attributes.type.probability.resource = 0.1f;
        }
    }
}