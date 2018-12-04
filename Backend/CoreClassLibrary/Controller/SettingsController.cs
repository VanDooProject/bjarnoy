using System;
using System.Collections.Generic;
using System.Text;
using CoreClassLibrary.Models.Settings;

namespace CoreClassLibrary.Controller
{
    public class SettingsController
    {
        private static readonly Lazy<SettingsController> lazy =
            new Lazy<SettingsController>(() => new SettingsController());

        public static SettingsController Instance { get { return lazy.Value; } }

        private SettingsController()
        {
            // check if exisits in file, if not create new
            settings = new SettingsWrapper();
            settings.V1 = new SettingsV1();
        }



        private SettingsWrapper settings;


        public SettingsWrapper GetSettings()
        {
            return settings;
        }
    }
}
