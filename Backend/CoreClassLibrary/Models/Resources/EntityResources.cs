using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Helper;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Resources
{
    /// <summary>
    /// this model contains information about the users overall production and storage of resources
    /// </summary>
    public class EntityResources
    {
        /// <summary>
        /// amount of res produced hourly in users global space
        /// </summary>
        public Resources HourlyResourceProduction;

        /// <summary>
        /// last time when storage amount was refreshed
        /// </summary>
        [JsonIgnore] // frontend should not know this
        public DateTime LastResourceStorageRefresh;

        /// <summary>
        /// users global stored res
        /// </summary>
        [JsonIgnore] // frontend should not know this - only the calculated property
        public Resources ResourceStoredAtLastCalculation;

        /// <summary>
        /// returns current amount of available resources
        /// </summary>
        [BsonIgnore]
        public Resources ResourcesStoredCurrently
        {
            get
            {
                double hoursSinceLastCalculation = (Time.Now - this.LastResourceStorageRefresh).TotalHours;

                Resources storage = this.ResourceStoredAtLastCalculation +  
                       this.HourlyResourceProduction * hoursSinceLastCalculation;

                storage.Clip(this.ResourceStorageCapacity);
                return storage;
            }
        }

        /// <summary>
        /// users global storage capacity
        /// </summary>
        public Resources ResourceStorageCapacity;

        /// <summary>
        /// version of data in database
        /// has to be incremented every time data is changed to avoid race conditions
        /// </summary>
        [JsonIgnore] // frontend should not know this internal value
        public int Version = 0;



        public void SubtractResources(Resources resources)
        {
            // save new values - TODO: refactor to own method
            this.ResourceStoredAtLastCalculation = this.ResourcesStoredCurrently;
            this.LastResourceStorageRefresh = Time.Now; // TODO - fix using other time then the line above

            // subtract
            this.ResourceStoredAtLastCalculation = ResourceStoredAtLastCalculation - resources;

            // update version for db -> only onw operation can be done on this entity before DB has to be updated
            this.Version++;
        }

        public void addProduction(Resources resources)
        {
            // save new values - TODO: refactor to own method
            this.ResourceStoredAtLastCalculation = this.ResourcesStoredCurrently;
            this.LastResourceStorageRefresh = Time.Now; // TODO - fix using other time then the line above

            // subtract
            this.HourlyResourceProduction = HourlyResourceProduction + resources;

            // update version for db -> only onw operation can be done on this entity before DB has to be updated
            this.Version++;
        }
    }
}
