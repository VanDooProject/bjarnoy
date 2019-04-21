using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Player;
using CoreClassLibrary.Models.Resources;

namespace CoreClassLibrary.Factory
{
    public class PlayerFactory
    {
        public Player GetStartingPlayer(string DisplayName)
        {
            var player = new Player()
            {
                DisplayName = DisplayName
            };

            // set res
            player.EntityResources = new EntityResources()
            {
                LastResourceStorageRefresh = DateTime.Now,
                ResourceStoredAtLastCalculation = new Resources() { wood = 100, stone = 100, iron = 100, gold = 100 },
                ResourceStorageCapacity = new Resources() { wood = 800, stone = 800, iron = 800, gold = 800 },
                HourlyResourceProduction = new Resources() { wood = 10, stone = 10, iron = 10, gold = 10 },
            };

            // create base
            // set start tower




            return player;
        }
    }
}
