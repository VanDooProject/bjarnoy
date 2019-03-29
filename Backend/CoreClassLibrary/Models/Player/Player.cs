using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Generic;
using CoreClassLibrary.Models.Resources;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Player
{
    public class Player : MinimalPlayer
    {
        [JsonIgnore] // <- should be gathered as own data not with user object
        public EntityResources EntityResources { get; set; }


        [JsonIgnore] // <- should not be leaked to external interfaces
        public List<PlayerPermission> Permissions = new List<PlayerPermission>();

        public void setOwner(UserModel user)
        {
            Permissions.Add(new PlayerPermission()
            {
                Permission = PlayerPermission.PermissionLevel.owner,
                User = user
            });
        }

        public MinimalPlayer GetMinimalClone()
        {
            // TODO - make proper deep copy
            var player = new MinimalPlayer()
            {
                _id = this._id,
                DisplayName = this.DisplayName
            };
            return player;
        }
    }
}
