namespace CoreClassLibrary.Models.Map.Biomes
{
    public class GrasslandBiom : Biom
    {
        public GrasslandBiom() : base()
        {
            this.attributes.type.description = "Grassland";
            this.attributes.type.forest_probability = 0.1f;
            this.attributes.type.mountain_probability = 0.1f;
            this.attributes.type.resource_probability = 0.1f;
        }
    }
}