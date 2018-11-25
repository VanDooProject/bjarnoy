using System;
using System.Collections.Generic;
using System.Text;

namespace CoreClassLibrary.Models.Auth
{
    public class UserModel
    {
        public string Name { get; set; }
        public string Email { get; set; }
        public DateTime Birthdate { get; set; }
        public string Id { get; set; } = "";
    }
}
