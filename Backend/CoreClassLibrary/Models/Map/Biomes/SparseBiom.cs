namespace CoreClassLibrary.Models.Map.Biomes
{
    public class SparseBiom : Biom
    {
        public SparseBiom() : base()
        {
            this.attributes.type.description = "Sparse";
            this.attributes.type.forest_probability = 0.05f;
            this.attributes.type.mountain_probability = 0.0f;
            this.attributes.type.resource_probability = 0.05f;
        }
    }
}