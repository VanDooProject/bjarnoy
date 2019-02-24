using System.Reflection;
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
        public double wood { get; set; }

        [JsonConverter(typeof(JsonConverterDoubleToInt))]
        public double stone { get; set; }

        [JsonConverter(typeof(JsonConverterDoubleToInt))]
        public double iron { get; set; }

        [JsonConverter(typeof(JsonConverterDoubleToInt))]
        public double gold { get; set; }

        /// <summary>
        /// properties of this class to use for iterating over resTypes
        /// </summary>
        private static readonly PropertyInfo[] properties = typeof(Resources).GetProperties();

        /// <summary>
        /// clips all resources to given max
        /// </summary>
        /// <param name="ClipToResources">max amount of each resource</param>
        public void Clip(Resources ClipToResources)
        {
            // this.wood  = (this.wood  > ClipToResources.wood) ? ClipToResources.wood  : this.wood;

            foreach (PropertyInfo property in properties)
            {
                if ((double)property.GetValue(this) > (double)property.GetValue(ClipToResources))
                {
                    property.SetValue(this, property.GetValue(ClipToResources));
                }
            }
        }

        public static Resources operator +(Resources a, Resources b)
        {
            Resources res = new Resources();

            // res.wood = a.wood + b.wood;
            foreach (PropertyInfo property in properties)
            {
                property.SetValue(res, (double) property.GetValue(a) + (double) property.GetValue(b));
            }

            return res;
        }

        public static Resources operator -(Resources a, Resources b)
        {
            Resources res = new Resources();
            
            // res.wood = a.wood - b.wood;
            foreach (PropertyInfo property in properties)
            {
                property.SetValue(res, (double)property.GetValue(a) - (double)property.GetValue(b));
            }

            // TODO: what should happen if values get negative?

            return res;
        }

        public static Resources operator *(Resources a, double factor)
        {
            Resources res = new Resources();

            // res.wood  = a.wood  * factor;
            foreach (PropertyInfo property in properties)
            {
                property.SetValue(res, (double)property.GetValue(a) * factor);
            }

            return res;
        }

        public static bool operator <(Resources a, Resources b)
        {
            // if (!(a.wood < b.wood))
            //     return false;

            foreach (PropertyInfo property in properties)
            {
                if (!((double)property.GetValue(a) < (double)property.GetValue(b)))
                    return false;
            }

            return true;
        }

        public static bool operator >(Resources a, Resources b)
        {
            // if (!(a.wood > b.wood))
            //     return false;

            foreach (PropertyInfo property in properties)
            {
                if (!((double)property.GetValue(a) > (double)property.GetValue(b)))
                    return false;
            }

            return true;
        }
    }
}
