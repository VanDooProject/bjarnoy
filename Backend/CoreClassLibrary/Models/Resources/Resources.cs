using System;
using System.Collections.Generic;
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
        /// property setter & getter of this class to use for iterating over resTypes
        /// </summary>
        private static readonly List<GetterSetterPair> PropertiesGetterSetterPairs = CreateGetterSetterList();

        /// <summary>
        /// ideas from https://www.c-sharpcorner.com/article/boosting-up-the-reflection-performance-in-c-sharp/
        /// </summary>
        private class GetterSetterPair
        {
            internal Action<Resources, double> setter;

            internal Func<Resources, double> getter;

            public GetterSetterPair(PropertyInfo property)
            {
                setter = (Action<Resources, double>)Delegate.CreateDelegate(typeof(Action<Resources, double>), null, property.GetSetMethod());
                getter = (Func<Resources, double>) Delegate.CreateDelegate(typeof(Func<Resources, double>), null, property.GetGetMethod());
            }
        }

        private static List<GetterSetterPair> CreateGetterSetterList()
        {
            List<GetterSetterPair> PropertiesGetterSetterPairs = new List<GetterSetterPair>();

            PropertyInfo[] properties = typeof(Resources).GetProperties();

            foreach (PropertyInfo property in properties)
            {
                if (property.PropertyType == typeof(double))
                {
                    PropertiesGetterSetterPairs.Add(new GetterSetterPair(property));
                }
            }

            return PropertiesGetterSetterPairs;
        }

        /// <summary>
        /// clips all resources to given max
        /// </summary>
        /// <param name="ClipToResources">max amount of each resource</param>
        public void Clip(Resources ClipToResources)
        {
            // this.wood  = (this.wood  > ClipToResources.wood) ? ClipToResources.wood  : this.wood;
            foreach (GetterSetterPair property in PropertiesGetterSetterPairs)
            {
                if ((double)property.getter(this) > (double)property.getter(ClipToResources))
                {
                    property.setter(this, property.getter(ClipToResources));
                }
            }
        }

        public static Resources operator +(Resources a, Resources b)
        {
            Resources res = new Resources();

            // res.wood = a.wood + b.wood;
            foreach (GetterSetterPair property in PropertiesGetterSetterPairs)
            {
                property.setter(res, (double) property.getter(a) + (double) property.getter(b));
            }

            return res;
        }

        public static Resources operator -(Resources a, Resources b)
        {
            Resources res = new Resources();
            
            // res.wood = a.wood - b.wood;
            foreach (GetterSetterPair property in PropertiesGetterSetterPairs)
            {
                property.setter(res, (double)property.getter(a) - (double)property.getter(b));
            }

            // TODO: what should happen if values get negative?

            return res;
        }

        public static Resources operator *(Resources a, double factor)
        {
            Resources res = new Resources();

            // res.wood  = a.wood  * factor;
            foreach (GetterSetterPair property in PropertiesGetterSetterPairs)
            {
                property.setter(res, (double)property.getter(a) * factor);
            }

            return res;
        }

        public static bool operator <(Resources a, Resources b)
        {
            // if (!(a.wood < b.wood))
            //     return false;

            foreach (GetterSetterPair property in PropertiesGetterSetterPairs)
            {
                if (!((double)property.getter(a) < (double)property.getter(b)))
                    return false;
            }

            return true;
        }

        public static bool operator >(Resources a, Resources b)
        {
            // if (!(a.wood > b.wood))
            //     return false;

            foreach (GetterSetterPair property in PropertiesGetterSetterPairs)
            {
                if (!((double)property.getter(a) > (double)property.getter(b)))
                    return false;
            }

            return true;
        }
    }
}
