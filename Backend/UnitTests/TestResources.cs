using System;
using System.Diagnostics;
using CoreClassLibrary.Models.Resources;
using NUnit.Framework;

namespace UnitTests
{
    public class TestResources
    {
        public const double TOLERANCE = 0.001;

        [Test]
        public void ResourceAdd()
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
        public void ResourceSubtract()
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
        public void ResourceMultiplication()
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
        public void ResourceLessThanComparison()
        {
            var res1 = new Resources() { wood = 100, stone = 100, iron = 100, gold = 100 };
            var res2 = new Resources() { wood = 200, stone = 200, iron = 200, gold = 200 };

            Debug.Assert(res1 < res2);
        }

        [Test]
        public void ResourceMoreThanComparison()
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
        public void ResourceLessThanComparisonInvalid()
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
        public void ResourceMoreThanComparisonInvalid()
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
        public void ResourceMoreThanComparisonButEquals()
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
        public void ResourceLessThanComparisonButEquals()
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
        public void ResourceComparisonAgainstScalar()
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
        public void ResourceClip()
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
