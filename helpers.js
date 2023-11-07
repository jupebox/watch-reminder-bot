const millisecondsInTenMinutes = 10 * 60 * 1000;
const millisecondsInOneHour = 60 * 60 * 1000
const millisecondsInTwoHours = 2 * millisecondsInOneHour;
const millisecondsInOneDay = 24 * millisecondsInOneHour;
const millisecondsInOneWeek = 7 * millisecondsInOneDay;

// we start our weeks on monday, not sunday, for scheduling purposes to group the weekend as a unit
const dayIndeces = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// iirc this is the date format that all browsers can agree is a valid date. don't quote me on that
const formatDate = date => {
    return `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
}

const todayDayIndex = () => {
    const now = new Date();
    let nowDayIndex = now.getDay() - 1; // convert to monday week start
    if (nowDayIndex < 0) {
        nowDayIndex = 6; // reset sunday to last day of the week
    }
    return nowDayIndex;
}

const nextWatchDate = (reminder) => {
    const { cadence, dayIndex, lastWatchDate, time } = reminder;
    // get the last watched date and add to it the number of weeks that should be between watches
    const lastWatchTime = new Date(lastWatchDate).getTime();
    const nextWatchTime = lastWatchTime + (Number(cadence) * millisecondsInOneWeek);
    let eventDate = new Date(nextWatchTime);
    const now = new Date();
    const timeZoneOffset = now.getTimezoneOffset() / 60;
    const [hour, minute = 0] = time.split(":");
    eventDate.setHours((Number(hour) + timeZoneOffset), minute);
    // if that day is not the right day of the week, subtract days equal to the difference?
    // the next watch date should be the day of the week that the show is watched on
    const eventDateDayIndex = eventDate.getDay();
    const dayDateIndex = dayIndex === 6 ? 0 : dayIndex + 1;
    const dayIndexDiff = eventDateDayIndex - dayDateIndex;
    if (dayIndexDiff) {
        const daysToSubtract = dayIndexDiff > 0 ? dayIndexDiff : dayIndexDiff + 7;
        eventDate.setTime(eventDate.getTime() - (daysToSubtract * millisecondsInOneDay))
    }
    return eventDate;
};

const isDST = (date) => {
    let jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
    let jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
    return Math.max(jan, jul) !== date.getTimezoneOffset();
}

const convertTimeZone = (date) => {
    const now = new Date();
    const serverTimeZoneOffset = now.getTimezoneOffset();
    const standardTimeOffset = 480;
    const daylightTimeOffset = 420;
    const scheduleTimeZoneOffset = isDST(now) ? daylightTimeOffset : standardTimeOffset;
    if (serverTimeZoneOffset !== scheduleTimeZoneOffset) {
        // positive number means the server is in the future (later in the day) than the schedule
        const hourDifference = (scheduleTimeZoneOffset - serverTimeZoneOffset) / 60;
        date.setTime(date.getTime() + (hourDifference * millisecondsInOneHour));
    }
    return date;
}

exports.millisecondsInTenMinutes = millisecondsInTenMinutes;
exports.millisecondsInOneHour = millisecondsInOneHour;
exports.millisecondsInTwoHours = millisecondsInTwoHours;
exports.millisecondsInOneDay = millisecondsInOneDay;
exports.millisecondsInOneWeek = millisecondsInOneWeek;
exports.dayIndeces = dayIndeces;
exports.formatDate = formatDate;
exports.nextWatchDate = nextWatchDate;
exports.todayDayIndex = todayDayIndex;
exports.convertTimeZone = convertTimeZone;