using System;
using System.Collections.Generic;
using System.Text;

namespace CoreClassLibrary.Models.Buildings
{
    public class StorageHouse : Building
    {
        /// <summary>
        /// how much can be stored in this building\n
        /// or how much is stored in this building if built
        /// </summary>
        public Resources.Resources StorageCapacity;
    }
}
