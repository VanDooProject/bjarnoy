namespace CoreClassLibrary.Models.Map.Biomes
{
    public class ForestBiom : Biom
    {
        public ForestBiom() : base()
        {
            this.attributes.type.description = "Forest";
            this.attributes.type.forest_probability = 0.6f;
            this.attributes.type.mountain_probability = 0.1f;
            this.attributes.type.resource_probability = 0.1f;
        }
    }
}