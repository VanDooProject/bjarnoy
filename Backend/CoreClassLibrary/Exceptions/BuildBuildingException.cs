using System;
using System.Collections.Generic;
using System.Text;

namespace CoreClassLibrary.Exceptions
{
    public class BuildBuildingException : GameException
    {
        public BuildBuildingException()
        {
        }

        public BuildBuildingException(string message) : base(message)
        {
        }

        public BuildBuildingException(string message, Exception innerException) : base(message, innerException)
        {
        }
    }
}
