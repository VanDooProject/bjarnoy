using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using CoreClassLibrary.Exceptions;
using CoreClassLibrary.Models;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Resources;
using CoreClassLibrary.Models.Settings;
using CoreClassLibrary.Models.Technologies;
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
                try
                {
                    // file exists -> parse
                    using (StreamReader file = File.OpenText(_settingsFile))
                    {
                        this._buildtech = (List<Technology>)serializer.Deserialize(file, typeof(List<Technology>));
                    }

                    // TODO check if all is valid (all have level, duration, valid res,...)
                }
                catch (Newtonsoft.Json.JsonSerializationException e)
                {
                    logger.ErrorFormat("error in '{0}' can't load because of: {1}", _settingsFile, e);

                    // create new as fallback -> this is better than http 500 error
                    // TODO: notify admin of this failure
                    createDefaultBuildTech();
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
            _buildtech = new List<Technology>()
            {
                new BuildTechnology()
                {
                    Building = new Tower()
                    {
                        Level = 1,
                        RangeOfInfluence = 1,
                    },
                    ResearchDuration = new TimeSpan(00, 00, 30),
                    ResourcesNeeded = new Resources() {
                        wood = 10,
                        stone = 30,
                        iron = 5,
                        gold = 5,
                    },
                    requirements = new List<IRequirement>(),
                    AllowedTiles = new List<Tile>()
                    {
                        new GrassTile(),
                        new SandTile(),
                    },
                },
                new BuildTechnology()
                {
                    Building = new Tower()
                    {
                        Level = 2,
                        RangeOfInfluence = 2,
                    },
                    ResearchDuration = new TimeSpan(00, 00, 30),
                    ResourcesNeeded = new Resources() {
                        wood = 10,
                        stone = 30,
                        iron = 5,
                        gold = 5,
                    },
                    requirements = new List<IRequirement>(),
                    // todo: remove since this should not matter anymore
                    AllowedTiles = new List<Tile>()
                    {
                        new GrassTile(),
                        new SandTile(),
                    },
                },
                new BuildTechnology()
                {
                    Building = new Tower()
                    {
                        Level = 3,
                        RangeOfInfluence = 3,
                    },
                    ResearchDuration = new TimeSpan(00, 00, 30),
                    ResourcesNeeded = new Resources() {
                        wood = 10,
                        stone = 30,
                        iron = 5,
                        gold = 5,
                    },
                    requirements = new List<IRequirement>(),
                    // todo: remove since this should not matter anymore
                    AllowedTiles = new List<Tile>()
                    {
                        new GrassTile(),
                        new SandTile(),
                    },
                },

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
                    AllowedTiles = new List<Tile>()
                    {
                        new GrassTile()
                    },
                },

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
                    AllowedTiles = new List<Tile>()
                    {
                        new ForestTile()
                    },
                }
            };

            // TODO check if all is valid (all have level, duration, valid ress,...)

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


        private List<Technology> _buildtech;


        public List<Technology> GetBuildTech()
        {
            return _buildtech;
        }

        public BuildTechnology findTech(string BuildingName, int level)
        {
            var techs = BuildTechController.Instance.GetBuildTech();
            Technology tech = techs.FirstOrDefault(t =>
            {
                if (t is BuildTechnology b)
                {
                    return b.Building.type == BuildingName && // b.Building.GetType().ToString().Split('.').Last()     -> the same as type
                           b.Building.Level == level;
                }
                return false;
            });

            BuildTechnology buildTech = tech as BuildTechnology;

            if (buildTech == null)
            {
                // TODO: report user
                logger.Warn("no valid building found in tech tree - probably a user faked this request -> report to bot detector");
                throw new BuildBuildingException("no valid building found in tech tree");
            }

            return buildTech;
        }
    }
}
