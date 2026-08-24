using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Reflection;
using System.Text;
using CoreClassLibrary.Models.Buildings;

namespace CoreClassLibrary.ValidationAttributes
{
    // https://stackoverflow.com/questions/32987119/validate-model-on-specific-string-values
    public class BuildingNameAttribute : ValidationAttribute
    {

        // https://stackoverflow.com/questions/13896716/generating-a-list-of-child-classes-with-reflection-in-net-3-5
        private readonly string[] _allowableValues = 
            Assembly.GetExecutingAssembly().GetTypes()
                .Where(
                        t => 
                            t.IsClass &&
                            !t.IsAbstract &&
                            //t != typeof(Building) &&
                            typeof(Building).IsAssignableFrom(t)
                    )
                .Select(t => t.Name).ToArray();
        

        protected override ValidationResult IsValid(object value, ValidationContext validationContext)
        {
            if (_allowableValues?.Contains(value?.ToString()) == true)
            {
                return ValidationResult.Success;
            }

            // TODO: report user for boting ... can't access user data here so maybe log 400 for users?

            var msg = $"Please enter one of the allowable values: {string.Join(", ", (_allowableValues ?? new string[] { "No allowable values found" }))}.";
            return new ValidationResult(msg);
        }
    }
}
