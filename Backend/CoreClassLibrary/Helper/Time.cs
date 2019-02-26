using System;

namespace CoreClassLibrary.Helper
{
    /// <summary>
    /// Used for getting DateTime.Now(), time is changeable for unit testing
    /// Source: https://stackoverflow.com/a/9911500/2298744
    /// </summary>
    public static class Time
    {
        /// <summary> Normally this is a pass-through to DateTime.Now, but it can be overridden with SetDateTime( .. ) for testing or debugging.
        /// </summary>
        public static Func<DateTime> NowFunc = () => DateTime.Now;

        public static DateTime Now => NowFunc();

        /// <summary> Set time to return when SystemTime.Now() is called.
        /// </summary>
        public static void SetDateTime(DateTime dateTimeNow)
        {
            NowFunc = () => dateTimeNow;
        }

        /// <summary> Resets SystemTime.Now() to return DateTime.Now.
        /// </summary>
        public static void ResetDateTime()
        {
            NowFunc = () => DateTime.Now;
        }
    }
}
