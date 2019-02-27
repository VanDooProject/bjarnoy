using System;
using System.Diagnostics;
using CoreClassLibrary.Helper;
using CoreClassLibrary.Models.Resources;
using NUnit.Framework;

namespace UnitTests
{
    public class TestPlayingEntityResources
    {
        [Test]
        public void ResourceGeneration()
        {
            // Arrange
            int year = 1970;
            int hour = 0;
            int minute = 0;
            int sec = 0;

            var fixedTime = new DateTime(year, 1, 1, hour, minute, sec);
            Time.SetDateTime(fixedTime); // this could fail (other tests) if tests run in parallel
            Assert.AreEqual(year, Time.Now.Year);

            // setup test
            int production = 10;
            int alreadyStoredRes = 100;

            var res = new UserResources()
            {
                LastResourceStorageRefresh = Time.Now.AddHours(-1),
                ResourceStorageCapacity = new Resources()
                {
                    wood = 1000
                },
                HourlyResourceProduction = new Resources()
                {
                    wood = production
                },
                ResourceStoredAtLastCalculation = new Resources()
                {
                    wood = alreadyStoredRes
                }
            };

            // check
            double TOLERANCE = 0.001;
            Debug.Assert(Math.Abs(res.ResourcesStoredCurrently.wood - (alreadyStoredRes + production)) < TOLERANCE);
        }
    }
}
