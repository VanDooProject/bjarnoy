using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Auth;

namespace CoreClassLibrary.Models.Player
{
    public class PlayerPermission
    {
        /// <summary>
        /// user which is allowed to control this entity/player
        /// TODO: fix data duplication problem
        /// </summary>
        public UserModel User;

        public PermissionLevel Permission = PermissionLevel.guest;

        /// <summary>
        /// enum for different permission levels
        /// * owner = has all rights for this account (can set permissions for other users to this player)
        /// * full_access = all rights as owner but cant change rights, delete account, ...
        /// * sitter = only can use game mechanics
        /// * guest = can only do GET requests, can't read messages, ...
        /// </summary>
        public enum PermissionLevel
        {
            owner = 0,
            full_access,
            sitter,
            guest
        }
    }
}
