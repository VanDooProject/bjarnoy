using System;

namespace CoreClassLibrary.Observer
{
    public partial class QueueObserver
    {
        private class QueueNotImplementedException : NotImplementedException
        {
            public QueueNotImplementedException()
            {
            }

            public QueueNotImplementedException(string message) : base(message)
            {
            }

            public QueueNotImplementedException(string message, Exception inner) : base(message, inner)
            {
            }
        }
    }
}