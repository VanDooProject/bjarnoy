using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using CoreClassLibrary.Models;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Settings;
using log4net;
using Newtonsoft.Json;

namespace CoreClassLibrary.Controller
{
    public class BuildTechController
    {
        private ILog logger = LogManager.GetLogger(typeof(BuildTechController));

        private const string _settingsFile = @"./config/build-tech.json";

        private static readonly Lazy<BuildTechController> lazy =
            new Lazy<BuildTechController>(() => new BuildTechController());

        public static BuildTechController Instance { get { return lazy.Value; } }

        private JsonSerializer serializer;

        private BuildTechController()
        {
            serializer = new JsonSerializer();
            serializer.Formatting = Formatting.Indented;
            serializer.TypeNameHandling = TypeNameHandling.Objects;

            // check if exists in file, if not create new
            if (File.Exists(_settingsFile))
            {
                // file exists -> parse
                using (StreamReader file = File.OpenText(_settingsFile))
                {
                    this._buildtech = (List<Building>)serializer.Deserialize(file, typeof(List<Building>));
                }
            }
            else
            {
                // create new
                createDefaultBuildTech();
            }

            logger.DebugFormat("loaded {0} build techs", _buildtech.Count);
        }

        private void createDefaultBuildTech()
        {
            // TODO: refactor this to multiple files for better overview or to json (but there is no syntax checking)
            _buildtech = new List<Building>()
            {
                new StorageHouse()
                {
                    Level = 1,
                    ResourcesNeeded = new Resources() {
                        wood = 250,
                        stone = 250,
                    },
                    requirements = new List<IRequirement>(),
                    allowedTiles = new List<Tile>()
                    {
                        new GrasTile()
                    },
                    StorageCapacity = new Resources()
                    {
                        wood = 1000,
                        stone = 1000,
                        iron = 100,
                        gold = 10,
                    }
                },

                new Lumberjack()
                {
                    Level = 1,
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
                    allowedTiles = new List<Tile>()
                    {
                        new ForestTile()
                    },
                    gatherRate = 10
                }
            };

            // save them to file
            saveBuildTechToFile();
        }

        private void saveBuildTechToFile()
        {
            Directory.CreateDirectory(new FileInfo(_settingsFile).Directory.FullName);

            // serialize JSON directly to a file
            using (StreamWriter file = File.CreateText(_settingsFile))
            {
                serializer.Serialize(file, _buildtech);
            }
        }


        private List<Building> _buildtech;


        public List<Building> GetBuildTech()
        {
            return _buildtech;
        }
    }
}
