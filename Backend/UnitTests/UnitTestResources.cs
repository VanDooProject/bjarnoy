using System;
using System.Diagnostics;
using CoreClassLibrary.Models.Resources;
using Xunit;

namespace UnitTests
{
    public class UnitTestResources
    {
        public const double TOLERANCE = 0.001;

        [Fact]
        public void TestResourceAdd()
        {
            var res1 = new Resources()
            {
                wood = 1,
                stone = 2,
                iron = 3,
                gold = 4
            };
            var res2 = new Resources()
            {
                wood = 1,
                stone = 2,
                iron = 3,
                gold = 4
            };

            var res3 = res1 + res2;

            Debug.Assert(Math.Abs(res3.wood - 2) < TOLERANCE);
            Debug.Assert(Math.Abs(res3.stone - 4) < TOLERANCE);
            Debug.Assert(Math.Abs(res3.iron - 6) < TOLERANCE);
            Debug.Assert(Math.Abs(res3.gold - 8) < TOLERANCE);
        }

        [Fact]
        public void TestResourceLessThanComparison()
        {
            var res1 = new Resources() { wood = 100, stone = 100, iron = 100, gold = 100 };
            var res2 = new Resources() { wood = 200, stone = 200, iron = 200, gold = 200 };

            Debug.Assert(res1 < res2);
        }

        [Fact]
        public void TestResourceMoreThanComparison()
        {
            var res1 = new Resources()
            {
                wood = 200,
                stone = 200,
                iron = 200,
                gold = 200
            };
            var res2 = new Resources()
            {
                wood = 100,
                stone = 100,
                iron = 100,
                gold = 100
            };

            Debug.Assert(res1 > res2);
        }

        [Fact]
        public void TestResourceLessThanComparisonInvalid()
        {
            var res1 = new Resources()
            {
                wood  = 200,
                stone = 100,
                iron  = 100,
                gold  = 100
            };
            var res2 = new Resources()
            {
                wood  = 200,
                stone = 200,
                iron  = 200,
                gold  = 200
            };

            Debug.Assert(res1 < res2 == false);
        }

        [Fact]
        public void TestResourceMoreThanComparisonInvalid()
        {
            var res1 = new Resources()
            {
                wood = 200,
                stone = 200,
                iron = 200,
                gold = 200
            };
            var res2 = new Resources()
            {
                wood = 200,
                stone = 199,
                iron = 200,
                gold = 200
            };

            Debug.Assert(res1 > res2 == false);
        }


        [Fact]
        public void TestResourceMoreThanComparisonButEquals()
        {
            var res1 = new Resources()
            {
                wood = 100,
                stone = 100,
                iron = 100,
                gold = 100
            };
            var res2 = new Resources()
            {
                wood = 100,
                stone = 100,
                iron = 100,
                gold = 100
            };

            Debug.Assert(res1 > res2 == false);
        }


        [Fact]
        public void TestResourceLessThanComparisonButEquals()
        {
            var res1 = new Resources()
            {
                wood = 100,
                stone = 100,
                iron = 100,
                gold = 100
            };
            var res2 = new Resources()
            {
                wood = 100,
                stone = 100,
                iron = 100,
                gold = 100
            };

            Debug.Assert(res1 < res2 == false);
        }


        [Fact]
        public void TestResourceClip()
        {
            var res1 = new Resources()
            {
                wood = 200,
                stone =200,
                iron = 200,
                gold = 200
            };
            var res2 = new Resources()
            {
                wood = 100,
                stone = 100,
                iron = 100,
                gold = 100
            };

            res1.Clip(res2);

            Debug.Assert(res1 < res2 == false);
            Debug.Assert(res1 > res2 == false);
        }
    }
}
