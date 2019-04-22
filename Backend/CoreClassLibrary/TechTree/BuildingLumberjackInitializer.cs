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
    public class BuildingLumberjackInitializer : ITreeInitializer
    {
        public List<Technology> GetTechnologies()
        {
            List<Tile> allowedTiles = new List<Tile>()
            {
                new ForestTile()
            };

            var list = new List<Technology>()
            {
                new BuildTechnology()
                {
                    Building = new Lumberjack()
                    {
                        Level = 1,
                        gatherRate = new Resources() {
                            wood = 10,
                        },
                    },
                    ResearchDuration = new TimeSpan(0, 2, 30), // 2 min and 30 sec
                    ResourcesNeeded = new Resources() {
                        wood = 100,
                        stone = 100,
                    },
                    requirements = new List<IRequirement>()
                    {
                        new BuildingRequirement()
                        {
                            RequiredBuilding = new StorageHouse()
                            {
                                Level = 1
                            }
                        }
                    },
                    AllowedTiles = allowedTiles,
                }
            };

            return list;
        }
    }
}
