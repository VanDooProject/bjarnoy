namespace CoreClassLibrary.Models.Map.Biomes
{
    public class MountainBiom : Biom
    {
        public MountainBiom() : base()
        {
            this.attributes.type.description = "Mountain";
            this.attributes.type.forest_probability = 0.1f;
            this.attributes.type.mountain_probability = 0.6f;
            this.attributes.type.resource_probability = 0.1f;
        }
    }
}