using System;
using System.Collections.Generic;
using System.Text;

namespace CoreClassLibrary.Models.Map.Coordinates
{

    /// <summary>
    /// cube representation of hex coordinate system
    ///
    /// https://www.redblobgames.com/grids/hexagons/
    /// </summary>
    public class CubeCoordinates3D : Coordinates3D
    {
        public float Distance(CubeCoordinates3D b)
        {
            return Distance(this, b);
        }

        /// <summary>
        /// distance in hex coordinate system based on Cube calculations
        /// </summary>
        /// <param name="a"></param>
        /// <param name="b"></param>
        /// <returns></returns>
        public static float Distance(CubeCoordinates3D a, CubeCoordinates3D b)
        {
            return (Math.Abs(a.x - b.x) + Math.Abs(a.y - b.y) + Math.Abs(a.z - b.z)) / 2f;
        }

        /// <summary>
        /// conversion from one to another system
        ///
        /// we use y as r not z
        /// </summary>
        /// <param name="v"></param>
        public static explicit operator CubeCoordinates3D(HexCoordinates3D v)
        {
            CubeCoordinates3D coord = new CubeCoordinates3D();
            coord.x = v.x; // q
            coord.y = v.y; // r

            coord.z = -v.x-v.y;

            return coord;
        }
    }
}
