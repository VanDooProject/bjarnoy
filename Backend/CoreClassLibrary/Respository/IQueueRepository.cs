using System.Collections.Generic;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.TechQueues;

namespace CoreClassLibrary.Respository
{
    public interface IQueueRepository
    {
        void Add(Queue queue);
        List<Queue> AllUnprocessedByUser(UserModel user);
        Queue GetAndUpdateFinished();
        Queue MarkAsProcessed(Queue entry);
    }
}