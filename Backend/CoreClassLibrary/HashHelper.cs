using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace CoreClassLibrary
{
    public class HashHelper
    {
        private static readonly Lazy<HashHelper> lazy =
            new Lazy<HashHelper>(() => new HashHelper());

        public static HashHelper Instance { get { return lazy.Value; } }

        private HashHelper()
        {
        }


        public string Hash(string password, string salt)
        {
            // woulb be one option but complicated to write in a few lines
            //var pbkdf2 = new Rfc2898DeriveBytes(password, Encoding.ASCII.GetBytes(salt));
            using (SHA512 shaM = new SHA512Managed())
            {
                return Convert.ToBase64String(shaM.ComputeHash(Encoding.ASCII.GetBytes(password + salt)));
            }
        }
    }
}
