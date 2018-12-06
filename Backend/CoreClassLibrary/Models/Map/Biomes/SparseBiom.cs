namespace CoreClassLibrary.Models.Map.Biomes
{
    public class SparseBiom : Biom
    {
        public SparseBiom() : base()
        {
            this.attributes.type.description = "Sparse";
            this.attributes.type.probability.forest = 0.05f;
            this.attributes.type.probability.mountain = 0.0f;
            this.attributes.type.probability.resource = 0.05f;
        }
    }
}