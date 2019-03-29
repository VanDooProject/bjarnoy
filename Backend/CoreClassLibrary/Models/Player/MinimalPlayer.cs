using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Auth;
using CoreClassLibrary.Models.Generic;
using CoreClassLibrary.Models.Resources;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Player
{
    public class MinimalPlayer : MongoEntity
    {
        /// <summary>
        /// name which is shown to other users
        /// </summary>
        public string DisplayName;
    }
}
