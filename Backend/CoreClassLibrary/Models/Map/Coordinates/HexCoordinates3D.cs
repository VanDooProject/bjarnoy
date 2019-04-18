using System;
using System.Collections.Generic;
using System.Text;

namespace CoreClassLibrary.Models.Map.Coordinates
{

    /// <summary>
    /// axial representation of coordinates for hex coordinate system
    ///
    /// https://www.redblobgames.com/grids/hexagons/
    /// </summary>
    public class HexCoordinates3D : Coordinates3D
    {
        public HexCoordinates3D()
        {
        }

        public HexCoordinates3D(int x, int y)
        {
            this.x = x; // q
            this.y = y; // r
        }

        public float Distance(HexCoordinates3D b)
        {
            return Distance(this, b);
        }

        /// <summary>
        /// distance in hex coordinate system
        /// </summary>
        /// <param name="a"></param>
        /// <param name="b"></param>
        /// <returns></returns>
        public static float Distance(HexCoordinates3D a, HexCoordinates3D b)
        {
            CubeCoordinates3D a1 = (CubeCoordinates3D) a;
            CubeCoordinates3D b1 = (CubeCoordinates3D) b;

            return a1.Distance(b1);
        }

        public static HexCoordinates3D operator +(HexCoordinates3D a, HexCoordinates3D b)
        {
            return new HexCoordinates3D
            {
                x = a.x + b.x,
                y = a.y + b.y
            };
        }

        public static HexCoordinates3D operator -(HexCoordinates3D a, HexCoordinates3D b)
        {
            return new HexCoordinates3D
            {
                x = a.x - b.x,
                y = a.y - b.y
            };
        }


        public override string ToString()
        {
            return $"( {this.x} | {this.y} )";
        }
    }
}
