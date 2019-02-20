using System;
using System.Diagnostics;
using CoreClassLibrary.Models.Resources;
using Xunit;

namespace UnitTests
{
    public class UnitTestResources
    {
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
                wood  = 200,
                stone = 200,
                iron  = 200,
                gold  = 200
            };
            var res2 = new Resources()
            {
                wood  = 100,
                stone = 100,
                iron  = 100,
                gold  = 100
            };

            Debug.Assert(res1 > res2);
        }
    }
}
