/** Whether the server marked the building as standing outside its owner's realm. */
export function isOutsideRealm(building) {
    return !!building?.outsideRealmSince;
}
/**
 * Seconds until the building loses its next level, counted down from when the answer arrived (`fetchedAtMs`), or null when the
 * building is inside the realm or the server gave no time (a frozen world clock).
 */
export function secondsToNextLevelLoss(building, fetchedAtMs, nowMs) {
    if (!isOutsideRealm(building) || building?.nextLevelLossInSeconds == null)
        return null;
    return Math.max(0, building.nextLevelLossInSeconds - (nowMs - fetchedAtMs) / 1000);
}
/**
 * A wait as the player reads it, in the player's language: days and hours from a day on, hours and minutes from an hour on, else
 * minutes (never less than one).
 */
export function formatDecayWait(seconds, locale) {
    const unit = (value, name) => new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'long' }).format(value);
    const total = Math.max(0, Math.round(seconds / 60));
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const minutes = total % 60;
    if (days > 0)
        return hours > 0 ? `${unit(days, 'day')}, ${unit(hours, 'hour')}` : unit(days, 'day');
    if (hours > 0)
        return minutes > 0 ? `${unit(hours, 'hour')}, ${unit(minutes, 'minute')}` : unit(hours, 'hour');
    return unit(Math.max(1, minutes), 'minute');
}
