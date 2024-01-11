using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using CoreClassLibrary.Annotations;

namespace CoreClassLibrary.Models.Settings
{
    [Serializable]
    public class SettingsV1 : ObservableData
    {
        //public String MongoDatabaseServerAddress
        //{
        //    get;
        //    set
        //    {
        //        base.observedChanges(MethodBase.GetCurrentMethod().Name, value);
        //
        //    }
        //} = "mongodb";


        public String MongoDatabaseServerAddress { get; set; } = "127.0.0.1"; // "mongodb";
        public int MongoDatabaseServerPort { get; set; } = 27017;
        public int MongoDatabaseServerTimeoutSeconds { get; set; } = 5;//seconds

        public float Vector3EqualsAllowedDistanceDisturbance = 0.01f;

        public string WorldId { get; set; } = "WorldId";
        public string WorldName { get; set; } = "WorldName";
    }
}
