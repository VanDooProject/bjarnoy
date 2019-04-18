using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Text;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Resources;
using CoreClassLibrary.Models.Technologies;

namespace CoreClassLibrary.TechTree
{
    [SuppressMessage("ReSharper", "UnusedMember.Global")]
    public class BuildingStorageHouseInitializer : ITreeInitializer
    {
        public List<Technology> GetTechnologies()
        {
            List<Tile> allowedTiles = new List<Tile>()
            {
                new GrassTile()
            };

            var list = new List<Technology>()
            {
                new BuildTechnology()
                {
                    Building = new StorageHouse()
                    {
                        Level = 1,
                        StorageCapacity = new Resources()
                        {
                            wood = 1000,
                            stone = 1000,
                            iron = 100,
                            gold = 10,
                        }
                    },
                    ResearchDuration = new TimeSpan(0, 5, 12), // 5 min and 12 sec
                    ResourcesNeeded = new Resources() {
                        wood = 250,
                        stone = 250,
                    },
                    requirements = new List<IRequirement>(),
                    AllowedTiles = allowedTiles,
                },
            };

            return list;
        }
    }
}
