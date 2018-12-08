using CoreClassLibrary.Models.Buildings;

namespace CoreClassLibrary.Models.Buildings
{
    public abstract class ResourceBuilding : Building
    {
        /// <summary>
        /// hourly gather rate
        /// </summary>
        public double gatherRate;
    }
}
