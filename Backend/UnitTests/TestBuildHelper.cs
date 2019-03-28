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
            IQueueRepository queueRepo = Substitute.For<IQueueRepository>();

            var helper = new BuildHelper(islandRepo, queueRepo);
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
            IIslandRepository islandRepo = Substitute.For<IIslandRepository>();
            islandRepo.getTile(0, 0, 0).ReturnsForAnyArgs(new ForestTile(new Vector3(0, 0, 0)));

            //float posX = 1;
            //repo.getTile(posX, 0, 0).Returns(new Tile(new Vector3(posX, 0, 0)));
            //Assert.AreEqual(posX, repo.getTile(posX, 0, 0).Position.X);

            //UserResources UserResources = Substitute.For<UserResources>();
            //UserResources.ResourcesStoredCurrently.Returns(new Resources()
            //{
            //    wood = double.MaxValue,
            //    stone = double.MaxValue,
            //    iron = double.MaxValue,
            //    gold = double.MaxValue,
            //});

            IQueueRepository queueRepo = Substitute.For<IQueueRepository>();
            //queueRepo.Add(null)...

            var helper = new BuildHelper(islandRepo, queueRepo);
            var building = new BuildBuildingModel()
            {
                Level = 1,
                BuildingName = typeof(Lumberjack).ToString().Split('.').Last()
            };
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




            // run helper
            var res = helper.BuildBuilding(building, playingEntity);
            Assert.NotNull(res);


            // TODO check if queue got correct building and level
            //queueRepo.Add(null).Received(Quantity.AtLeastOne());
        }

        // check user no res
    }
}
