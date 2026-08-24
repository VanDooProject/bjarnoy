using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Numerics;
using System.Text;
using CoreClassLibrary.Exceptions;
using CoreClassLibrary.Helper;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Buildings;
using CoreClassLibrary.Models.Map.Coordinates;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.Resources;
using CoreClassLibrary.Respository;
using NSubstitute;
using NSubstitute.ReceivedExtensions;
using NUnit.Framework;
using NUnit.Framework.Internal;

namespace UnitTests
{
    public class TestBuildHelper
    {
        [SetUp]
        protected void SetUp()
        {

        }

        [Test]
        public void CheckUnkownTech()
        {
            IIslandRepository islandRepo = Substitute.For<IIslandRepository>();
            PlayerRepository playerRepo = Substitute.For<PlayerRepository>();

            var helper = new BuildHelper(islandRepo, playerRepo);
            var building = new BuildBuildingModel();
            var player = new Player();

            Assert.Throws<BuildBuildingException>(() =>
            {
                helper.BuildBuilding(building, player);
            });

        }

        [Test]
        public void AllWorking()
        {
            var playingEntity = new Player()
            {
                EntityResources = new EntityResources()
                {
                    ResourceStorageCapacity = Resources.Max,
                    LastResourceStorageRefresh = Time.Now,
                    HourlyResourceProduction = Resources.Max,
                    ResourceStoredAtLastCalculation = Resources.Max,
                }
            };

            IIslandRepository islandRepo = Substitute.For<IIslandRepository>();
            Tile dummyTile = new ForestTile(new HexCoordinates3D(0, 0))
            {
                Owner = playingEntity
            };
            islandRepo.getTile(0, 0, 0).ReturnsForAnyArgs(dummyTile);

            IQueueRepository queueRepo = Substitute.For<IQueueRepository>();
            //queueRepo.Add(null)...
            IPlayerRepository playerRepo = Substitute.For<IPlayerRepository>();
            playerRepo.When(x => x.ReplaceAwareOfResources(Arg.Any<Player>())).Do(info => { });

            var helper = new BuildHelper(islandRepo, playerRepo);
            var building = new BuildBuildingModel()
            {
                Level = 1,
                BuildingName = typeof(Lumberjack).ToString().Split('.').Last()
            };


            // run helper
            var res = helper.BuildBuilding(building, playingEntity);
            Assert.NotNull(res);


            // TODO check if queue got correct building and level
            //queueRepo.Add(null).Received(Quantity.AtLeastOne());
        }

        // check user no res
    }
}
