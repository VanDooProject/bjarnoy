using System;
using System.Collections.Generic;
using System.Numerics;
using System.Text;

namespace CoreClassLibrary.Models.Map.Coordinates
{
    public abstract class Coordinates3D
    {
        public int x;
        public int y;
        public int z;

        /// <summary>
        /// distance in squared coordinate system
        /// </summary>
        /// <param name="a"></param>
        /// <param name="b"></param>
        /// <returns></returns>
        //public static double DistanceSquared(Coordinates3D a, Coordinates3D b)
        //{
        //    return
        //        Math.Pow(a.X + b.X, 2) +
        //        Math.Pow(a.Y + b.Y, 2) +
        //        Math.Pow(a.Z + b.Z, 2);
        //}

        /// <summary>
        /// distance in squared coordinate system
        /// </summary>
        /// <param name="a"></param>
        /// <param name="b"></param>
        /// <returns></returns>
        //public static double Distance(Coordinates3D a, Coordinates3D b)
        //{
        //    return Math.Sqrt(DistanceSquared(a, b));
        //}
    }
}
