using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Generic;
using CoreClassLibrary.Models.Resources;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Player
{
    public class Player : MongoEntity
    {
        /// <summary>
        /// name which is shown to other users
        /// </summary>
        public string DisplayName;


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
    }
}
