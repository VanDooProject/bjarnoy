using System;
using System.Collections.Generic;
using System.Text;

namespace CoreClassLibrary.Exceptions
{
    public class IllegalTileException : GameException
    {
        public IllegalTileException()
        {
        }

        public IllegalTileException(string message) : base(message)
        {
        }

        public IllegalTileException(string message, Exception innerException) : base(message, innerException)
        {
        }
    }
}
