using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;
using System.Numerics;
using CoreClassLibrary.Models.Map.Tiles;
using CoreClassLibrary.ValidationAttributes;

namespace CoreClassLibrary.Models.Buildings
{
    public class BuildBuildingModel
    {
        [Required]
        public Vector3 Position { get; set; }
        
        [Required]
        [RegularExpression(@"^[a-zA-Z]*$")]
        [BuildingName] // [BuildingName(ErrorMessage = "")]
        public string BuildingName { get; set; }

        [Required]
        [Range(1, 100)]
        public int Level { get; set; }
    }
}
