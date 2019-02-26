using System;
using System.Diagnostics;
using CoreClassLibrary.Models.Resources;
using NUnit.Framework;

namespace UnitTests
{
    public class UnitTestResources
    {
        public const double TOLERANCE = 0.001;

        [Test]
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


        [Test]
        public void TestResourceSubtract()
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

            var res3 = res1 - res2;

            Debug.Assert(Math.Abs(res3.wood) < TOLERANCE);
            Debug.Assert(Math.Abs(res3.stone) < TOLERANCE);
            Debug.Assert(Math.Abs(res3.iron) < TOLERANCE);
            Debug.Assert(Math.Abs(res3.gold) < TOLERANCE);
        }


        [Test]
        public void TestResourceMultiplication()
        {
            var res1 = new Resources()
            {
                wood = 1,
                stone = 2,
                iron = 3,
                gold = 4
            };

            var res3 = res1 * 100;

            Debug.Assert(Math.Abs(res3.wood - 100) < TOLERANCE);
            Debug.Assert(Math.Abs(res3.stone - 200) < TOLERANCE);
            Debug.Assert(Math.Abs(res3.iron - 300) < TOLERANCE);
            Debug.Assert(Math.Abs(res3.gold - 400) < TOLERANCE);
        }

        [Test]
        public void TestResourceLessThanComparison()
        {
            var res1 = new Resources() { wood = 100, stone = 100, iron = 100, gold = 100 };
            var res2 = new Resources() { wood = 200, stone = 200, iron = 200, gold = 200 };

            Debug.Assert(res1 < res2);
        }

        [Test]
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

        [Test]
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

        [Test]
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


        [Test]
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


        [Test]
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


        [Test]
        public void TestResourceComparisonAgainstScalar()
        {
            var res1 = new Resources()
            {
                wood = 200,
                stone = 200,
                iron = 200,
                gold = 200
            };

            Debug.Assert(res1 < 100 == false);
            Debug.Assert(res1 < 201);

            Debug.Assert(res1 > 201 == false);
            Debug.Assert(res1 > 199);
        }


        [Test]
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
