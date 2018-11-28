using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Generic;

namespace CoreClassLibrary.Models.Auth
{
    public class UserModel : MongoEntity
    {
        public string Username { get; set; }

        public string Password { get; set; }


        public string Email { get; set; }
    }
}
