using CoreClassLibrary.Models.Map;

namespace CoreClassLibrary.Factory
{
    public interface IIslandFactory
    {
        Island GetRndIsland(int size, int z);
    }
}