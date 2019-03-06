using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using CoreClassLibrary.Models.Map.Tiles;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Buildings
{
    public abstract class Building
    {
        /// <summary>
        /// Level of building
        /// </summary>
        public int Level;

        /// <summary>
        /// return type of building (used mainly for frontend)
        /// </summary>
        public string type
        {
            get { return this.GetType().ToString().Split('.').Last(); }
        }


        // call this before converting to json not used in techtree stuff or before saveing to DB
        public Building CleanTechData()
        {
            Building b = (Building) this.MemberwiseClone();

            //b.ResourcesNeeded = null;
            //b.requirements = null;
            //b.allowedTiles = null;

            return b;
        }
    }
}
