using CoreClassLibrary.Models.TechQueues;

namespace CoreClassLibrary.QueueHandler
{
    public interface IBuildQueueHandler
    {
        void processEntry(BuildingQueue entry);
    }
}