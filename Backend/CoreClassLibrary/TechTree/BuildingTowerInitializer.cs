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
    public class BuildingTowerInitializer : ITreeInitializer
    {
        //[SuppressMessage("ReSharper", "UnusedMember.Global")]
        public List<Technology> GetTechnologies()
        {
            List<Tile> allowedTiles = new List<Tile>()
            {
                new GrassTile(),
                new SandTile(),
            };


            var list = new List<Technology>()
            {
                new BuildTechnology()
                {
                    Building = new Tower()
                    {
                        Level = 1,
                        RangeOfInfluence = 1,
                    },
                    ResearchDuration = new TimeSpan(00, 00, 30),
                    ResourcesNeeded = new Resources()
                    {
                        wood = 10,
                        stone = 30,
                        iron = 5,
                        gold = 5,
                    },
                    requirements = new List<IRequirement>(),
                    AllowedTiles = allowedTiles,
                },
                new BuildTechnology()
                {
                    Building = new Tower()
                    {
                        Level = 2,
                        RangeOfInfluence = 2,
                    },
                    ResearchDuration = new TimeSpan(00, 00, 30),
                    ResourcesNeeded = new Resources()
                    {
                        wood = 10,
                        stone = 30,
                        iron = 5,
                        gold = 5,
                    },
                    requirements = new List<IRequirement>(),
                    AllowedTiles = allowedTiles,
                },
                new BuildTechnology()
                {
                    Building = new Tower()
                    {
                        Level = 3,
                        RangeOfInfluence = 3,
                    },
                    ResearchDuration = new TimeSpan(00, 00, 30),
                    ResourcesNeeded = new Resources()
                    {
                        wood = 10,
                        stone = 30,
                        iron = 5,
                        gold = 5,
                    },
                    requirements = new List<IRequirement>(),
                    AllowedTiles = allowedTiles,
                },
            };

            return list;
        }
    }
}
