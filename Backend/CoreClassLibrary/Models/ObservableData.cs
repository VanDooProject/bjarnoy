using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using CoreClassLibrary.Annotations;

namespace CoreClassLibrary.Models
{
    public class ObservableData : INotifyPropertyChanged
    {
        public delegate void dataChanged(string propertyName);

        private dataChanged _observerCallback;

        // https://stackoverflow.com/questions/9501928/monitor-a-change-in-property
        public event PropertyChangedEventHandler PropertyChanged;

        [NotifyPropertyChangedInvocator]
        protected virtual void OnPropertyChanged([CallerMemberName] string propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
            observedChanges(propertyName);
        }


        public void registerObserver(dataChanged clb)
        {
            _observerCallback += clb;
        }


        //public void unregisterObserver(dataChanged clb)
        //{
        //    ObserverCallback -= clb;
        //}

        protected void observedChanges(string propertyName)
        {
            _observerCallback?.Invoke(propertyName);
        }
    }
}
