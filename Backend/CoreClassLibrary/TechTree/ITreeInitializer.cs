using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Technologies;

namespace CoreClassLibrary.TechTree
{
    public interface ITreeInitializer
    {
        List<Technology> GetTechnologies();
    }
}
