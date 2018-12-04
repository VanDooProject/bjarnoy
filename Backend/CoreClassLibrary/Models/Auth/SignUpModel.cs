using System.ComponentModel.DataAnnotations;

namespace CoreClassLibrary.Models.Auth
{
    // https://docs.microsoft.com/en-us/aspnet/core/mvc/models/validation?view=aspnetcore-2.0


    public class SignUpModel : SignInModel
    {
        [Required]
        [Display(Name = "Re-type Password")]
        [Compare("Password", ErrorMessage = "Passwords do not match")]
        public string PasswordConfirm { get; set; }


        [Required]
        [EmailAddress(ErrorMessage = "no valid Mail given")]
        public string Mail { get; set; }
    }
}
