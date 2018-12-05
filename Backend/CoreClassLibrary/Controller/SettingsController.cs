using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using CoreClassLibrary.Models.Settings;
using Newtonsoft.Json;

namespace CoreClassLibrary.Controller
{
    public class SettingsController
    {
        private const string _settingsFile = @"./config/settings.json";

        private static readonly Lazy<SettingsController> lazy =
            new Lazy<SettingsController>(() => new SettingsController());

        public static SettingsController Instance { get { return lazy.Value; } }

        private SettingsController()
        {
            // check if exists in file, if not create new
            if (File.Exists(_settingsFile))
            {
                // file exists -> parse
                using (StreamReader file = File.OpenText(_settingsFile))
                {
                    JsonSerializer serializer = new JsonSerializer();
                    this.settings = (SettingsWrapper)serializer.Deserialize(file, typeof(SettingsWrapper));
                }
            }
            else
            {
                // create new
                createNewSettings();
            }

            // this is not working since every property has to fire event
            settings.V1.registerObserver(PropertyName =>
            {
                Console.WriteLine(String.Format("{0} changed", PropertyName));
                this.saveSettingsToFile();
            });

            //settings.V1.MongoDatabaseServerTimeoutSeconds = 2;
        }

        private void createNewSettings()
        {
            settings = new SettingsWrapper();
            settings.V1 = new SettingsV1();

            // save them to file
            saveSettingsToFile();
        }

        private void saveSettingsToFile()
        {
            Directory.CreateDirectory(new FileInfo(_settingsFile).Directory.FullName);

            // serialize JSON directly to a file
            using (StreamWriter file = File.CreateText(_settingsFile))
            {
                JsonSerializer serializer = new JsonSerializer();
                serializer.Serialize(file, settings);
            }
        }


        private SettingsWrapper settings;


        public SettingsWrapper GetSettings()
        {
            return settings;
        }
    }
}
