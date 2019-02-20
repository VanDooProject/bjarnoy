using CoreClassLibrary.Serializer;
using Newtonsoft.Json;

namespace CoreClassLibrary.Models.Resources
{
    /// <summary>
    /// resources needed to build something
    /// or resources transported
    /// </summary>
    public class Resources
    {
        [JsonConverter(typeof(JsonConverterDoubleToInt))]
        public double wood = 0.0;

        [JsonConverter(typeof(JsonConverterDoubleToInt))]
        public double stone = 0.0;

        [JsonConverter(typeof(JsonConverterDoubleToInt))]
        public double iron = 0.0;

        [JsonConverter(typeof(JsonConverterDoubleToInt))]
        public double gold = 0.0;

        /// <summary>
        /// clips all resources to given max
        /// </summary>
        /// <param name="ClipToResources">max amount of each resource</param>
        public void Clip(Resources ClipToResources)
        {
            // TODO: find out if this could be refactored to be more generic
            this.wood  = (this.wood  > ClipToResources.wood) ? ClipToResources.wood  : this.wood;
            this.stone = (this.stone > ClipToResources.wood) ? ClipToResources.stone : this.stone;
            this.iron  = (this.iron  > ClipToResources.iron) ? ClipToResources.iron  : this.iron;
            this.gold  = (this.gold  > ClipToResources.gold) ? ClipToResources.gold  : this.gold;
        }

        public static Resources operator +(Resources a, Resources b)
        {
            Resources res = new Resources();

            // TODO: find out if this could be refactored to be more generic
            res.wood = a.wood + b.wood;
            res.stone = a.stone + b.stone;
            res.iron = a.iron + b.iron;
            res.gold = a.gold + b.gold;

            return res;
        }

        public static Resources operator -(Resources a, Resources b)
        {
            Resources res = new Resources();

            // TODO: find out if this could be refactored to be more generic
            res.wood = a.wood - b.wood;
            res.stone = a.stone - b.stone;
            res.iron = a.iron - b.iron;
            res.gold = a.gold - b.gold;

            // TODO: what should happen if values get negative?

            return res;
        }

        public static Resources operator *(Resources a, double factor)
        {
            Resources res = new Resources();

            // TODO: find out if this could be refactored to be more generic
            res.wood  = a.wood  * factor;
            res.stone = a.stone * factor;
            res.iron  = a.iron  * factor;
            res.gold  = a.gold  * factor;

            return res;
        }

        public static bool operator <(Resources a, Resources b)
        {
            if (!(a.wood < b.wood))
                return false;

            if (!(a.stone < b.stone))
                return false;

            if (!(a.iron < b.iron))
                return false;

            if (!(a.gold < b.gold))
                return false;

            return true;
        }

        public static bool operator >(Resources a, Resources b)
        {
            if (!(a.wood > b.wood))
                return false;

            if (!(a.stone > b.stone))
                return false;

            if (!(a.iron > b.iron))
                return false;

            if (!(a.gold > b.gold))
                return false;

            return true;
        }
    }
}
