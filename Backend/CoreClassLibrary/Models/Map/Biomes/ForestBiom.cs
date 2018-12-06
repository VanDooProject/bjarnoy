namespace CoreClassLibrary.Models.Map.Biomes
{
    public class ForestBiom : Biom
    {
        public ForestBiom() : base()
        {
            this.attributes.type.description = "Forest";
            this.attributes.type.probability.forest = 0.6f;
            this.attributes.type.probability.mountain = 0.1f;
            this.attributes.type.probability.resource = 0.1f;
        }
    }
}