using System;
using System.Collections.Generic;
using System.Text;

namespace CoreClassLibrary.Exceptions
{
    public class UpdateResourceException : GameException
    {
        public UpdateResourceException()
        {
        }

        public UpdateResourceException(string message) : base(message)
        {
        }

        public UpdateResourceException(string message, Exception innerException) : base(message, innerException)
        {
        }
    }
}
