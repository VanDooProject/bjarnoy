using System.ComponentModel.DataAnnotations;

namespace CoreClassLibrary.Models.Auth
{
    // https://docs.microsoft.com/en-us/aspnet/core/mvc/models/validation?view=aspnetcore-2.0


    public class SignInModel
    {
        [Required]
        [MaxLength(16)]
        [MinLength(4)]
        [RegularExpression("^[a-zA-Z0-9_]*$", ErrorMessage = "Username must be alphanumeric. Underscores are also allowed")]
        public string Username { get; set; }


        [Required]
        [MinLength(4)]
        public string Password { get; set; }


        public override string ToString()
        {
            return this.Username;
        }
    }
}
