using System;
using System.Collections.Generic;
using System.Text;

namespace CoreClassLibrary.Models.Buildings
{
    public class Tower : Building
    {
        /// <summary>
        /// defines range around tower where user is able to build buildings
        /// </summary>
        public float RangeOfInfluence;
    }
}
