namespace CoreClassLibrary.Models.Map.Biomes
{
    public class MountainBiom : Biom
    {
        public MountainBiom() : base()
        {
            this.attributes.type.description = "Mountain";
            this.attributes.type.probability.forest= 0.1f;
            this.attributes.type.probability.mountain = 0.6f;
            this.attributes.type.probability.resource = 0.1f;
        }
    }
}